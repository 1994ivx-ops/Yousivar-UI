/**
 * Small, explicit validators. No schema library: the surface is tiny and this
 * keeps the Worker bundle dependency-free.
 */
import { badRequest } from './errors.js';

export function text(value, { field, min = 1, max = 20000, trim = true } = {}) {
  if (typeof value !== 'string') throw badRequest(`${field} is required`);
  const out = trim ? value.trim() : value;
  if (out.length < min) throw badRequest(`${field} is too short`);
  if (out.length > max) throw badRequest(`${field} is too long`);
  return out;
}

export function optionalText(value, options) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, options);
}

export function email(value) {
  const out = text(value, { field: 'email', min: 3, max: 254 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(out)) throw badRequest('That email address is not valid');
  return out;
}

export function password(value) {
  if (typeof value !== 'string') throw badRequest('Password is required');
  if (value.length < 8) throw badRequest('Password must be at least 8 characters');
  if (value.length > 200) throw badRequest('Password is too long');
  return value;
}

export function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

export function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === 'true';
}

export function integer(value, { field, min = 0, max = 1_000_000, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw badRequest(`${field} is out of range`);
  return parsed;
}

export function uuid(value, field = 'id') {
  const out = text(value, { field, min: 36, max: 36 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out)) {
    throw badRequest(`${field} is not a valid id`);
  }
  return out;
}

export function list(value, { field, max = 50 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array`);
  return value.slice(0, max);
}