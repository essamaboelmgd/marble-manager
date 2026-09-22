const QUANTITY_SCALE = 1000;

function requireDimension(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} يجب أن يكون رقمًا أكبر من صفر`);
  }
  return value;
}

export function calculateAreaQtyScaled(width: number, height: number): number {
  const safeWidth = requireDimension(width, "العرض");
  const safeHeight = requireDimension(height, "الارتفاع");
  const scaled = Math.round(safeWidth * safeHeight * QUANTITY_SCALE);
  if (scaled <= 0) throw new Error("المساحة المحسوبة غير صحيحة");
  return scaled;
}

export function resolveQuantityScaled(input: {
  qtyScaled?: number;
  width?: number;
  height?: number;
}): number {
  if (input.width !== undefined || input.height !== undefined) {
    return calculateAreaQtyScaled(input.width ?? 0, input.height ?? 0);
  }
  if (!Number.isInteger(input.qtyScaled) || (input.qtyScaled ?? 0) <= 0) {
    throw new Error("الكمية يجب أن تكون رقمًا صحيحًا أكبر من صفر");
  }
  return input.qtyScaled as number;
}

export function calculateLineTotalMinor(qtyScaled: number, unitPriceMinor: number, discountMinor = 0): number {
  return Math.round((qtyScaled * unitPriceMinor) / QUANTITY_SCALE) - discountMinor;
}
