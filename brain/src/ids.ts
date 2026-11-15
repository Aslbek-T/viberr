let n = 0;
export const newId = (prefix = '') => `${prefix}${Date.now().toString(36)}${(n++).toString(36)}`;
