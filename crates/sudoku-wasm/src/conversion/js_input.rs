//! Preserve JS optional-field semantics before Serde buffers tagged enum contents.
use js_sys::{Array, Object, Reflect};
use sudoku_core::types::{CoreResult, EngineError};
use wasm_bindgen::{JsCast, JsValue};

const MAX_HINT_STEPS: u32 = 500;

fn invalid() -> EngineError {
    EngineError::invalid("Hint evidence does not match the requested rules")
}

fn record(value: &JsValue) -> bool {
    value.is_object() && !value.is_null() && !Array::is_array(value)
}

/// Copies only a changed object spine. Caller-owned proof objects are never mutated.
pub fn map_field(
    value: JsValue,
    field: &str,
    normalize: fn(JsValue) -> CoreResult<JsValue>,
) -> CoreResult<JsValue> {
    if !record(&value) {
        return Ok(value);
    }
    let key = JsValue::from_str(field);
    let original = Reflect::get(&value, &key).map_err(|_| invalid())?;
    let normalized = normalize(original.clone())?;
    if normalized == original {
        return Ok(value);
    }
    let copy = Object::assign(&Object::new(), &Object::from(value));
    if !Reflect::set(&copy, &key, &normalized).map_err(|_| invalid())? {
        return Err(invalid());
    }
    Ok(copy.into())
}

pub fn step(value: JsValue) -> CoreResult<JsValue> {
    map_field(value, "evidence", |evidence| {
        if !record(&evidence) {
            return Ok(evidence);
        }
        let kind = Reflect::get(&evidence, &JsValue::from_str("kind")).map_err(|_| invalid())?;
        let units = JsValue::from_str("units");
        if kind.as_string().as_deref() != Some("unit")
            || !Reflect::has(&evidence, &units).map_err(|_| invalid())?
            || !Reflect::get(&evidence, &units)
                .map_err(|_| invalid())?
                .is_undefined()
        {
            return Ok(evidence);
        }
        // default Vec accepts an absent field, while buffered undefined and null both look like unit.
        // Remove only explicit undefined here so null remains a rejected, distinct input.
        let copy = Object::assign(&Object::new(), &Object::from(evidence));
        if !Reflect::delete_property(&copy, &units).map_err(|_| invalid())? {
            return Err(invalid());
        }
        Ok(copy.into())
    })
}

pub fn hint(value: JsValue) -> CoreResult<JsValue> {
    map_field(value, "steps", |steps| {
        if !Array::is_array(&steps) {
            return Ok(steps);
        }
        let array = steps.clone().dyn_into::<Array>().map_err(|_| invalid())?;
        if array.length() > MAX_HINT_STEPS {
            return Err(invalid());
        }
        let copy = Array::new();
        let mut changed = false;
        for original in array.iter() {
            let normalized = step(original.clone())?;
            changed |= normalized != original;
            copy.push(&normalized);
        }
        Ok(if changed { copy.into() } else { steps })
    })
}
