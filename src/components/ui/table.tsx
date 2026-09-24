import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

export type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
};

/**
 * Responsive admin table. Horizontally scrolls on narrow screens;
 * numeric columns can opt into right alignment.
 */
export function Table<T>({
  columns,
  rows,
  keyOf,
  emptyTitle = "No results",
  emptyDescription = "Try a different search or filter.",
  emptyAction,
  loading = false,
  loadingRows = 5,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="table-wrap" aria-busy="true" aria-label="Loading">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: loadingRows }, (_, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>
                    <span className="skeleton" style={{ display: "block", height: 16 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">{emptyTitle}</p>
        <p className="empty-state-desc">{emptyDescription}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === "left" || !column.align ? undefined : `th-${column.align}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyOf(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === "left" || !column.align ? undefined : `td-${column.align}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
