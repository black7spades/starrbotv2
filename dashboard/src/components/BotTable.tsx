import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { api } from "../api/client";
import InviteButton from "./InviteButton";

interface BotRow {
  id: string;
  name: string;
  clientId: string;
  status: string;
  error: string | null;
  guildCount: number;
  activeFunctions: string[];
  allFunctions: string[];
  enabled: boolean;
}

async function saveAsTemplate(botId: string) {
  const name = prompt("Template name:");
  if (!name) return;
  try {
    await api.createTemplate({ name, botId });
    alert("Template saved!");
  } catch (err: any) {
    alert(err.message || "Failed to save template");
  }
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-discord-green text-white",
  error: "bg-discord-red text-white",
  starting: "bg-yellow-500 text-white",
  stopped: "bg-discord-muted/30 text-discord-muted",
};

const col = createColumnHelper<BotRow>();

export default function BotTable({ bots }: { bots: BotRow[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});

  const startMutation = useMutation({
    mutationFn: (id: string) => api.startBot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bots"] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.stopBot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bots"] }),
  });

  const columns = useMemo(() => [
    col.display({
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="w-4 h-4 rounded border-discord-border text-discord-accent focus:ring-discord-accent"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-discord-border text-discord-accent focus:ring-discord-accent"
        />
      ),
      size: 40,
    }),
    col.accessor("name", {
      header: "Name",
      cell: (info) => (
        <button
          onClick={() => navigate(`/bots/${info.row.original.id}`)}
          className="text-left font-medium text-discord-accent hover:underline truncate max-w-[200px]"
        >
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        return (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.stopped}`}>
            {status}
          </span>
        );
      },
      filterFn: "includesString",
    }),
    col.display({
      id: "invite",
      header: "Invite",
      cell: (info) => (
        <InviteButton
          clientId={info.row.original.clientId}
          className="px-2 py-1 text-xs font-medium rounded bg-discord-accent/10 text-discord-accent hover:bg-discord-accent/20 transition-colors"
        />
      ),
      size: 120,
    }),
    col.accessor("activeFunctions", {
      header: "Functions",
      cell: (info) => {
        const active = info.getValue();
        const all = info.row.original.allFunctions;
        return (
          <span className="text-sm">
            {active.length > 0 ? (
              <span className="text-discord-green">{active.length}</span>
            ) : (
              <span className="text-discord-muted">0</span>
            )}
            <span className="text-discord-muted"> / {all.length}</span>
          </span>
        );
      },
      sortingFn: (a, b) => a.original.activeFunctions.length - b.original.activeFunctions.length,
    }),
    col.display({
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const bot = info.row.original;
        const isRunning = bot.status === "running";
        const isStarting = bot.status === "starting";
        return (
          <div className="flex items-center gap-1">
            {isRunning ? (
              <button
                onClick={(e) => { e.stopPropagation(); stopMutation.mutate(bot.id); }}
                disabled={stopMutation.isPending}
                className="px-2 py-1 text-xs font-medium rounded bg-discord-red/10 text-discord-red hover:bg-discord-red/20 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); startMutation.mutate(bot.id); }}
                disabled={isStarting || startMutation.isPending}
                className="px-2 py-1 text-xs font-medium rounded bg-discord-green/10 text-discord-green hover:bg-discord-green/20 transition-colors disabled:opacity-50"
              >
                {isStarting ? "Starting..." : "Start"}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/bots/${bot.id}`); }}
              className="px-2 py-1 text-xs font-medium rounded bg-discord-input text-discord-text hover:bg-discord-border transition-colors"
            >
              View
            </button>
            {bot.activeFunctions.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); saveAsTemplate(bot.id); }}
                className="px-2 py-1 text-xs font-medium rounded bg-discord-accent/10 text-discord-accent hover:bg-discord-accent/20 transition-colors"
                title="Save function configs as template"
              >
                Template
              </button>
            )}
          </div>
        );
      },
      size: 140,
    }),
  ], [navigate, startMutation, stopMutation]);

  const table = useReactTable({
    data: bots,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedIds = selectedRows.map((r) => r.original.id);

  const bulkEnable = async () => {
    for (const id of selectedIds) {
      await api.updateBot(id, { enabled: true });
    }
    queryClient.invalidateQueries({ queryKey: ["bots"] });
    setRowSelection({});
  };

  const bulkDisable = async () => {
    for (const id of selectedIds) {
      await api.updateBot(id, { enabled: false });
    }
    queryClient.invalidateQueries({ queryKey: ["bots"] });
    setRowSelection({});
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} bot(s)? This cannot be undone.`)) return;
    for (const id of selectedIds) {
      await api.deleteBot(id);
    }
    queryClient.invalidateQueries({ queryKey: ["bots"] });
    setRowSelection({});
  };

  return (
    <div className="space-y-4">
      {/* Search + Bulk Actions */}
      <div className="flex items-center gap-3">
        <input
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search bots..."
          className="flex-1 px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:outline-none"
        />
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-discord-muted">{selectedIds.length} selected</span>
            <button onClick={bulkEnable} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-green/10 text-discord-green hover:bg-discord-green/20 transition-colors">
              Enable
            </button>
            <button onClick={bulkDisable} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-input text-discord-text hover:bg-discord-border transition-colors">
              Disable
            </button>
            <button onClick={bulkDelete} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-red/10 text-discord-red hover:bg-discord-red/20 transition-colors">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-discord-card rounded-xl border border-discord-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-discord-border">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-4 py-3 text-left text-xs font-semibold text-discord-muted uppercase tracking-wider ${
                        header.column.getCanSort() ? "cursor-pointer select-none hover:text-discord-text" : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: " ↑",
                          desc: " ↓",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-discord-muted">
                    {bots.length === 0 ? "No bots yet. Create one to get started." : "No bots match your search."}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-discord-border/50 hover:bg-discord-input/50 transition-colors cursor-pointer ${
                      row.getIsSelected() ? "bg-discord-accent/5" : ""
                    }`}
                    onClick={() => navigate(`/bots/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
