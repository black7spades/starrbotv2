import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../api/client";

const FunctionConfigSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

type FunctionConfigForm = z.infer<typeof FunctionConfigSchema>;

export default function FunctionConfig() {
  const { botId, name } = useParams<{ botId: string; name: string }>();
  const navigate = useNavigate();

  const [manifest, setManifest] = useState<any>(null);
  const [currentConfig, setCurrentConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FunctionConfigForm>({
    resolver: zodResolver(FunctionConfigSchema),
    defaultValues: { enabled: false },
  });

  useEffect(() => {
    if (botId && name) {
      loadFunction();
    }
  }, [botId, name]);

  const loadFunction = async () => {
    try {
      setLoading(true);
      const [manifestData, configData] = await Promise.all([
        api.getFunctionManifest(name!),
        api.getBotFunction(botId!, name!),
      ]);
      setManifest(manifestData);
      setCurrentConfig(configData.config || {});
      setValue("enabled", configData.enabled || false);
      if (configData.config) {
        Object.entries(configData.config).forEach(([key, value]) => {
          setValue(`config.${key}`, value as any);
        });
      }
    } catch (err) {
      console.error("Failed to load function:", err);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: FunctionConfigForm) => {
    if (!botId || !name) return;
    setSaving(true);
    try {
      await api.updateFunctionConfig(botId, name, data);
      navigate(-1);
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!manifest) return <div className="text-center py-12">Function not found</div>;

  const configFields = manifest.configSchema?.properties || {};
  const requiredFields = manifest.configSchema?.required || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-discord-input">
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">{manifest.icon}</span>
              {manifest.label}
            </h1>
            <p className="text-discord-muted">{manifest.description}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Enable Toggle */}
        <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <h3 className="font-semibold">Enable {manifest.label}</h3>
              <p className="text-sm text-discord-muted">Toggle this function on/off for this bot</p>
            </div>
            <input
              type="checkbox"
              {...register("enabled")}
              className="w-5 h-5 rounded border-discord-border text-discord-accent focus:ring-discord-accent"
            />
          </label>
        </div>

        {/* Config Fields */}
        {Object.keys(configFields).length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Configuration</h2>
            {Object.entries(configFields).map(([key, field]: [string, any]) => (
              <ConfigField
                key={key}
                name={key}
                field={field}
                required={requiredFields.includes(key)}
                value={currentConfig[key]}
                register={register}
                errors={errors}
                disabled={!watch("enabled")}
              />
            ))}
          </div>
        )}

        {Object.keys(configFields).length === 0 && (
          <div className="p-4 bg-discord-card rounded-xl border border-discord-border text-discord-muted text-center">
            This function has no configuration options.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-discord-border">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfigField({
  name,
  field,
  required,
  value,
  register,
  errors,
  disabled,
}: {
  name: string;
  field: any;
  required: boolean;
  value: any;
  register: any;
  errors: any;
  disabled: boolean;
}) {
  const fieldName = `config.${name}`;
  const error = errors.config?.[name];

  if (field.type === "boolean") {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <h4 className="font-medium flex items-center gap-2">
              {field.title || name}
              {required && <span className="text-discord-red text-sm">*</span>}
            </h4>
            {field.description && <p className="text-sm text-discord-muted">{field.description}</p>}
          </div>
          <input
            type="checkbox"
            {...register(fieldName)}
            disabled={disabled}
            className="w-5 h-5 rounded border-discord-border text-discord-accent focus:ring-discord-accent disabled:opacity-50"
          />
        </label>
      </div>
    );
  }

  if (field.type === "string" && field.enum) {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="block">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            {field.title || name}
            {required && <span className="text-discord-red text-sm">*</span>}
          </h4>
          {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
          <select
            {...register(fieldName)}
            disabled={disabled}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
          >
            {field.enum.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
        </label>
      </div>
    );
  }

  if (field.type === "number" || field.type === "integer") {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="block">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            {field.title || name}
            {required && <span className="text-discord-red text-sm">*</span>}
          </h4>
          {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
          <input
            type="number"
            {...register(fieldName, { valueAsNumber: true })}
            disabled={disabled}
            min={field.minimum}
            max={field.maximum}
            step={field.type === "integer" ? 1 : "any"}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
            defaultValue={value}
          />
          {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
        </label>
      </div>
    );
  }

  // Default to text input
  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <label className="block">
        <h4 className="font-medium flex items-center gap-2 mb-2">
          {field.title || name}
          {required && <span className="text-discord-red text-sm">*</span>}
        </h4>
        {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
        <input
          type="text"
          {...register(fieldName)}
          disabled={disabled}
          placeholder={field.default ? String(field.default) : ""}
          className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
          defaultValue={value}
        />
        {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
      </label>
    </div>
  );
}