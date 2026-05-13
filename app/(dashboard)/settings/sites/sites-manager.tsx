"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PlusIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  EyeIcon,
  EyeOffIcon,
  ShoppingCartIcon,
  GraduationCapIcon,
  CheckCircle2Icon,
  XCircleIcon,
  BuildingIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── types ──────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  platform: "woocommerce" | "thinkific";
  url: string | null;
  subdomain: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  thinkific_api_key: string | null;
  color_hex: string;
  project_type: "standard" | "subscription" | "digital";
  is_active: boolean;
  created_at: string;
  last_sync: { created_at: string; status: string } | null;
}

interface SiteForm {
  name: string;
  platform: "woocommerce" | "thinkific";
  color_hex: string;
  project_type: "standard" | "subscription" | "digital";
  is_active: boolean;
  url: string;
  consumer_key: string;
  consumer_secret: string;
  subdomain: string;
  thinkific_api_key: string;
}

const DEFAULT_FORM: SiteForm = {
  name: "",
  platform: "woocommerce",
  color_hex: "#1B6EF3",
  project_type: "standard",
  is_active: true,
  url: "",
  consumer_key: "",
  consumer_secret: "",
  subdomain: "",
  thinkific_api_key: "",
};

// ── helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  subscription: "Subscription",
  digital: "Digital",
};

// ── sub-components ─────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  selected,
  onClick,
}: {
  platform: "woocommerce" | "thinkific";
  selected: boolean;
  onClick: () => void;
}) {
  const isWoo = platform === "woocommerce";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all focus:outline-none",
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
      )}
    >
      {isWoo ? (
        <ShoppingCartIcon className="size-6" />
      ) : (
        <GraduationCapIcon className="size-6" />
      )}
      {isWoo ? "WooCommerce" : "Thinkific"}
    </button>
  );
}

function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg",
        type === "success" ? "bg-green-600" : "bg-red-600"
      )}
    >
      {type === "success" ? (
        <CheckCircle2Icon className="size-4 shrink-0" />
      ) : (
        <XCircleIcon className="size-4 shrink-0" />
      )}
      {message}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function SitesManager() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [showSecret, setShowSecret] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites");
      if (res.ok) setSites(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  function setField<K extends keyof SiteForm>(key: K, value: SiteForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAddDialog() {
    setEditingSite(null);
    setForm(DEFAULT_FORM);
    setShowSecret(false);
    setShowApiKey(false);
    setDialogOpen(true);
  }

  function openEditDialog(site: Site) {
    setEditingSite(site);
    setForm({
      name: site.name,
      platform: site.platform,
      color_hex: site.color_hex,
      project_type: site.project_type,
      is_active: site.is_active,
      url: site.url ?? "",
      consumer_key: site.consumer_key ?? "",
      consumer_secret: site.consumer_secret ?? "",
      subdomain: site.subdomain ?? "",
      thinkific_api_key: site.thinkific_api_key ?? "",
    });
    setShowSecret(false);
    setShowApiKey(false);
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setEditingSite(null);
      setForm(DEFAULT_FORM);
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        platform: form.platform,
        color_hex: form.color_hex,
        project_type: form.project_type,
        is_active: form.is_active,
        url: form.platform === "woocommerce" ? form.url || null : null,
        consumer_key:
          form.platform === "woocommerce" ? form.consumer_key || null : null,
        consumer_secret:
          form.platform === "woocommerce" ? form.consumer_secret || null : null,
        subdomain:
          form.platform === "thinkific" ? form.subdomain || null : null,
        thinkific_api_key:
          form.platform === "thinkific" ? form.thinkific_api_key || null : null,
      };

      if (editingSite) {
        const res = await fetch(`/api/sites/${editingSite.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          showToast("Failed to save changes", "error");
          return;
        }
        await loadSites();
        setDialogOpen(false);
      } else {
        const res = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          showToast("Failed to create site", "error");
          return;
        }
        const newSite = await res.json();
        await loadSites();
        setDialogOpen(false);

        // Fire initial sync in background
        const syncPath =
          form.platform === "woocommerce"
            ? `/api/sync/woo/${newSite.id}`
            : `/api/sync/thinkific/${newSite.id}`;
        fetch(syncPath, { method: "POST" });
        showToast("Sync started, this may take a few minutes", "success");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this site? All orders and data will be removed."))
      return;
    const res = await fetch(`/api/sites/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadSites();
      showToast("Site deleted", "success");
    } else {
      showToast("Failed to delete site", "error");
    }
  }

  async function handleSync(site: Site) {
    setSyncing((s) => ({ ...s, [site.id]: true }));
    try {
      const path =
        site.platform === "woocommerce"
          ? `/api/sync/woo/${site.id}`
          : `/api/sync/thinkific/${site.id}`;
      const res = await fetch(path, { method: "POST" });
      if (res.ok) {
        showToast("Sync started, this may take a few minutes", "success");
      } else {
        showToast("Sync failed", "error");
      }
      await loadSites();
    } finally {
      setSyncing((s) => ({ ...s, [site.id]: false }));
    }
  }

  async function toggleActive(site: Site) {
    const next = !site.is_active;
    setSites((prev) =>
      prev.map((s) => (s.id === site.id ? { ...s, is_active: next } : s))
    );
    const res = await fetch(`/api/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      setSites((prev) =>
        prev.map((s) =>
          s.id === site.id ? { ...s, is_active: site.is_active } : s
        )
      );
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sajtovi</h1>
        <Button onClick={openAddDialog}>
          <PlusIcon />
          Dodaj sajt
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Loading...
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 rounded-xl border border-dashed text-center">
          <BuildingIcon className="size-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium">No sites yet</p>
            <p className="text-sm text-muted-foreground">
              Add your first WooCommerce or Thinkific site to get started.
            </p>
          </div>
          <Button variant="outline" onClick={openAddDialog}>
            <PlusIcon />
            Dodaj sajt
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: site.color_hex }}
                    />
                    <span className="font-medium">{site.name}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant="secondary">
                    {site.platform === "woocommerce"
                      ? "WooCommerce"
                      : "Thinkific"}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Badge variant="outline">
                    {PROJECT_TYPE_LABELS[site.project_type]}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Switch
                    checked={site.is_active}
                    onCheckedChange={() => toggleActive(site)}
                  />
                </TableCell>

                <TableCell className="text-muted-foreground text-xs">
                  {site.last_sync ? (
                    <span
                      title={new Date(site.last_sync.created_at).toLocaleString()}
                    >
                      {timeAgo(site.last_sync.created_at)}
                    </span>
                  ) : (
                    "Never"
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={syncing[site.id]}
                      onClick={() => handleSync(site)}
                    >
                      <RefreshCwIcon
                        className={cn(
                          "size-3.5",
                          syncing[site.id] && "animate-spin"
                        )}
                      />
                      <span className="sr-only">Sync</span>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                        <span className="sr-only">More</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(site)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(site.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSite ? "Edit Site" : "Add Site"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Platform selector — only shown when adding */}
            {!editingSite && (
              <FormField label="Platform">
                <div className="grid grid-cols-2 gap-3">
                  <PlatformCard
                    platform="woocommerce"
                    selected={form.platform === "woocommerce"}
                    onClick={() => setField("platform", "woocommerce")}
                  />
                  <PlatformCard
                    platform="thinkific"
                    selected={form.platform === "thinkific"}
                    onClick={() => setField("platform", "thinkific")}
                  />
                </div>
              </FormField>
            )}

            {/* Common fields */}
            <FormField label="Name">
              <Input
                placeholder="My Store"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color_hex}
                    onChange={(e) => setField("color_hex", e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <Input
                    value={form.color_hex}
                    onChange={(e) => setField("color_hex", e.target.value)}
                    className="font-mono uppercase"
                    maxLength={7}
                  />
                </div>
              </FormField>

              <FormField label="Project Type">
                <Select
                  value={form.project_type}
                  onValueChange={(val) =>
                    val &&
                    setField(
                      "project_type",
                      val as "standard" | "subscription" | "digital"
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="digital">Digital</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Active">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setField("is_active", checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {form.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </FormField>

            {/* WooCommerce fields */}
            {form.platform === "woocommerce" && (
              <>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    WooCommerce
                  </p>
                  <div className="flex flex-col gap-3">
                    <FormField
                      label="Store URL"
                      hint="e.g. https://mystore.com"
                    >
                      <Input
                        placeholder="https://mystore.com"
                        value={form.url}
                        onChange={(e) => setField("url", e.target.value)}
                      />
                    </FormField>

                    <FormField label="Consumer Key">
                      <Input
                        placeholder="ck_..."
                        value={form.consumer_key}
                        onChange={(e) =>
                          setField("consumer_key", e.target.value)
                        }
                      />
                    </FormField>

                    <FormField label="Consumer Secret">
                      <div className="relative">
                        <Input
                          type={showSecret ? "text" : "password"}
                          placeholder="cs_..."
                          value={form.consumer_secret}
                          onChange={(e) =>
                            setField("consumer_secret", e.target.value)
                          }
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecret ? (
                            <EyeOffIcon className="size-4" />
                          ) : (
                            <EyeIcon className="size-4" />
                          )}
                        </button>
                      </div>
                    </FormField>
                  </div>
                </div>
              </>
            )}

            {/* Thinkific fields */}
            {form.platform === "thinkific" && (
              <>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Thinkific
                  </p>
                  <div className="flex flex-col gap-3">
                    <FormField
                      label="Subdomain"
                      hint={`"yoursite" from yoursite.thinkific.com`}
                    >
                      <Input
                        placeholder="yoursite"
                        value={form.subdomain}
                        onChange={(e) => setField("subdomain", e.target.value)}
                      />
                    </FormField>

                    <FormField label="API Key">
                      <div className="relative">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="API key"
                          value={form.thinkific_api_key}
                          onChange={(e) =>
                            setField("thinkific_api_key", e.target.value)
                          }
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showApiKey ? (
                            <EyeOffIcon className="size-4" />
                          ) : (
                            <EyeIcon className="size-4" />
                          )}
                        </button>
                      </div>
                    </FormField>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : editingSite ? "Save Changes" : "Add Site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
