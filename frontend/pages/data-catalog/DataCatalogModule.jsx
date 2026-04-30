import { useCallback, useEffect, useState } from "react";
import intl from "react-intl-universal";
import { fetchCatalogTree } from "../../lib/catalogApi.js";
import CatalogTreePanel from "./CatalogTreePanel.jsx";
import CatalogListHome from "./CatalogListHome.jsx";
import MetaExplorer from "./MetaExplorer.jsx";
import CatalogDetailView from "./CatalogDetailView.jsx";

const initialSelection = {
  level: "catalogs",
  catalog: null,
  databaseName: null,
  tableName: null,
};

export default function DataCatalogModule() {
  const [tree, setTree] = useState(null);
  const [selection, setSelection] = useState(initialSelection);
  const [catalogGroupKey, setCatalogGroupKey] = useState("__all__");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const data = await fetchCatalogTree();
      setTree(data);
    } catch (e) {
      showToast(intl.get("dataCatalog.toast.loadError", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }, [showToast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const treeSelection = {
    level: selection.level,
    catalogId: selection.catalog?.catalogId ?? null,
    databaseName: selection.databaseName,
    tableName: selection.tableName,
  };

  const handleSelectRoot = useCallback(() => {
    setSelection(initialSelection);
    setCatalogGroupKey("__all__");
  }, []);

  const handleSelectCatalog = useCallback((cat) => {
    setSelection({
      level: "databases",
      catalog: {
        catalogId: cat.catalogId,
        catalogName: cat.catalogName,
        catalogType: cat.catalogType,
        catalogOrigin: cat.catalogOrigin,
      },
      databaseName: null,
      tableName: null,
    });
  }, []);

  const handleSelectDatabase = useCallback((cat, databaseName) => {
    setSelection({
      level: "tables",
      catalog: {
        catalogId: cat.catalogId,
        catalogName: cat.catalogName,
        catalogType: cat.catalogType,
        catalogOrigin: cat.catalogOrigin,
      },
      databaseName,
      tableName: null,
    });
  }, []);

  const handleSelectTable = useCallback((cat, databaseName, tableName) => {
    setSelection({
      level: "preview",
      catalog: {
        catalogId: cat.catalogId,
        catalogName: cat.catalogName,
        catalogType: cat.catalogType,
        catalogOrigin: cat.catalogOrigin,
      },
      databaseName,
      tableName,
    });
  }, []);

  const handleBack = useCallback(() => {
    setSelection((prev) => {
      if (prev.level === "catalogDetail") {
        return initialSelection;
      }
      if (prev.level === "preview") {
        return { ...prev, level: "tables", tableName: null };
      }
      if (prev.level === "tables") {
        return { ...prev, level: "databases", databaseName: null, tableName: null };
      }
      if (prev.level === "databases") {
        return initialSelection;
      }
      return prev;
    });
  }, []);

  const handleViewDatabasesFromTable = useCallback((row) => {
    setSelection({
      level: "databases",
      catalog: {
        catalogId: row.catalogId,
        catalogName: row.catalogName,
        catalogType: row.catalogType,
        catalogOrigin: row.catalogOrigin,
      },
      databaseName: null,
      tableName: null,
    });
  }, []);

  const handleViewDetailFromTable = useCallback((row) => {
    setSelection({
      level: "catalogDetail",
      catalog: {
        catalogId: row.catalogId,
        catalogName: row.catalogName,
        catalogType: row.catalogType,
        catalogOrigin: row.catalogOrigin,
        businessName: row.businessName,
      },
      databaseName: null,
      tableName: null,
    });
  }, []);

  const handleMetaSelectDatabase = useCallback((dbName) => {
    setSelection((prev) => {
      if (!prev.catalog) return prev;
      return { ...prev, level: "tables", databaseName: dbName, tableName: null };
    });
  }, []);

  const handleMetaSelectTable = useCallback((tbName) => {
    setSelection((prev) => ({
      ...prev,
      level: "preview",
      tableName: tbName,
    }));
  }, []);

  const handleSelectGroup = useCallback((groupKey) => {
    setSelection(initialSelection);
    setCatalogGroupKey(groupKey || "__all__");
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-950/30">
      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[200] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
          {toast}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[min(100%,18rem)] shrink-0 lg:w-72">
          <CatalogTreePanel
            tree={tree}
            selection={treeSelection}
            onSelectRoot={handleSelectRoot}
            onSelectCatalog={handleSelectCatalog}
            onSelectDatabase={handleSelectDatabase}
            onSelectTable={handleSelectTable}
            onSelectGroupCatalogs={handleSelectGroup}
          />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white dark:bg-gray-950/40">
          {selection.level === "catalogs" ? (
            <CatalogListHome
              onViewDatabases={handleViewDatabasesFromTable}
              onViewDetail={handleViewDetailFromTable}
              onTreeRefresh={loadTree}
              toast={showToast}
              catalogGroupKey={catalogGroupKey}
            />
          ) : selection.level === "catalogDetail" ? (
            <CatalogDetailView catalog={selection.catalog} onBack={handleBack} />
          ) : (
            <MetaExplorer
              view={selection.level}
              catalog={selection.catalog}
              databaseName={selection.databaseName}
              tableName={selection.tableName}
              onBack={handleBack}
              onSelectDatabase={handleMetaSelectDatabase}
              onSelectTable={handleMetaSelectTable}
              onTreeRefresh={loadTree}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}
