export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const assertObject = (value, label = '请求体') => {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new ValidationError(`${label}必须是对象`);
  return value;
};

export const text = (value, label, { min = 0, max = 2_000, nullable = false } = {}) => {
  if (value == null && nullable) return null;
  if (typeof value !== 'string') throw new ValidationError(`${label}必须是文本`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new ValidationError(`${label}长度必须在${min}到${max}之间`);
  return result;
};

export const optionalText = (value, label, options) => value === undefined ? undefined : text(value, label, options);

export const isoTime = (value, label) => {
  const result = text(value, label, { min: 20, max: 40 });
  if (Number.isNaN(Date.parse(result))) throw new ValidationError(`${label}必须是有效 ISO 时间`);
  return new Date(result).toISOString();
};

export const optionalIsoTime = (value, label) => value === undefined || value === null ? null : isoTime(value, label);

export const id = (value, label = 'ID') => text(value, label, { min: 8, max: 64 });

export const integer = (value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new ValidationError(`${label}必须是${min}到${max}之间的整数`);
  return value;
};

export const enumValue = (value, label, values) => {
  if (!values.includes(value)) throw new ValidationError(`${label}无效`);
  return value;
};
