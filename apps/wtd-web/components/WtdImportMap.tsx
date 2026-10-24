import { WTD_IMPORT_MAP } from "@/lib/wtd-import-map";

export function WtdImportMap() {
  return (
    <script
      type="importmap"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(WTD_IMPORT_MAP) }}
    />
  );
}
