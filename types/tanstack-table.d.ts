// Type augmentation for TanStack Table column meta
// Allows using custom meta fields like align/mono/etc.
declare module '@tanstack/table-core' {
  interface ColumnMeta<TData, TValue> {
    align?: 'left' | 'right'
    mono?: boolean
    colorizePL?: boolean
    flex?: boolean
  }
}

