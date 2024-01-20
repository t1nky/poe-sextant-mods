import {
  type SchemaFile
} from "pathofexile-dat-schema";
import { type DatFile } from "./dat/dat-file.js";
import { getHeaderLength, type Header } from "./dat/header.js";
import { readColumn } from "./dat/reader.js";


export function exportAllRows(headers: NamedHeader[], datFile: DatFile) {
  const columns = headers.map((header) => ({
    name: header.name,
    data: readColumn(header, datFile),
  }));

  columns.unshift({
    name: "_index",
    data: Array(datFile.rowCount)
      .fill(undefined)
      .map((_, idx) => idx),
  });

  return Array(datFile.rowCount)
    .fill(undefined)
    .map((_, idx) =>
      Object.fromEntries(columns.map((col) => [col.name, col.data[idx]]))
    );
}

export interface NamedHeader extends Header {
  name: string;
}

export function importHeaders(
  schema: SchemaFile,
  name: string,
  datFile: DatFile
): NamedHeader[] {
  const headers = [] as NamedHeader[];

  const sch = schema.tables.find((s) => s.name === name)!;
  let offset = 0;
  for (const column of sch.columns) {
    headers.push({
      name: column.name || "",
      offset,
      type: {
        array: column.array,
        integer:
          // column.type === 'u8' ? { unsigned: true, size: 1 }
          // : column.type === 'u16' ? { unsigned: true, size: 2 }
          // : column.type === 'u32' ? { unsigned: true, size: 4 }
          // : column.type === 'u64' ? { unsigned: true, size: 8 }
          // : column.type === 'i8' ? { unsigned: false, size: 1 }
          // : column.type === 'i16' ? { unsigned: false, size: 2 }
          column.type === "i32"
            ? { unsigned: false, size: 4 }
            : // : column.type === 'i64' ? { unsigned: false, size: 8 }
            column.type === "enumrow"
            ? { unsigned: false, size: 4 }
            : undefined,
        decimal:
          column.type === "f32"
            ? { size: 4 }
            : // : column.type === 'f64' ? { size: 8 }
              undefined,
        string: column.type === "string" ? {} : undefined,
        boolean: column.type === "bool" ? {} : undefined,
        key:
          column.type === "row" || column.type === "foreignrow"
            ? {
                foreign: column.type === "foreignrow",
              }
            : undefined,
      },
    });
    offset += getHeaderLength(headers[headers.length - 1], datFile);
  }
  return headers;
}
