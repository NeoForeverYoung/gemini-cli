/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Schema, Type } from '@google/genai';
import type { InputConfig } from './types.js';

/**
 * Converts an InputConfig object to a GenAI Schema object.
 */
export function convertInputConfigToGenaiSchema(
  inputConfig: InputConfig,
): Schema {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(inputConfig.inputs)) {
    let type: Type;
    let items: Schema | undefined;

    switch (value.type) {
      case 'string':
        type = Type.STRING;
        break;
      case 'number':
        type = Type.NUMBER;
        break;
      case 'boolean':
        type = Type.BOOLEAN;
        break;
      case 'integer':
        type = Type.INTEGER;
        break;
      case 'string[]':
        type = Type.ARRAY;
        items = { type: Type.STRING };
        break;
      case 'number[]':
        type = Type.ARRAY;
        items = { type: Type.NUMBER };
        break;
      default:
        type = Type.STRING; // Default to string if unknown
    }

    properties[key] = {
      type,
      description: value.description,
      ...(items ? { items } : {}),
    };

    if (value.required) {
      required.push(key);
    }
  }

  return {
    type: Type.OBJECT,
    properties,
    required,
  };
}
