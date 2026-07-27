import { useState } from "react";
import { api } from "../api/client";

interface Platform {
  id: string;
  name: string;
  icon: string;
  placeholder: string;
  helpText: string;
  buildPath: (input: string) => string;
  validate?: (input: string) => string | null;
}

const PLATFORMS: Platform[] = [
  {
    id: "instagram",
    name: "Instagram",
    icon: "📸",
    placeholder: "natgeo",
    helpText: "The Instagram username (without @)",
    buildPath: (u) => `instagram/2/user/${u.replace(/^@/, "")}`,
    validate: (u) => {
      const clean = u.replace(/^@/, "");
      if (!clean || clean.length < 1) return "Username is required";
      if (clean.includes(" ")) return "Username cannot contain spaces";
      return null;
    },
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "▶️",
    placeholder: "UCBJycsmduvYEL83R_U4JriQ",
    helpText: "Channel ID (from the channel URL) or username",
    buildPath: (u) => {
      if (u.startsWith("UC") && u.length > 20) return `youtube/channel/${u}`;
      return `youtube/user/${u}`;
    },
  },
  {
    id: "reddit",
    name: "Reddit",
    icon: "🤖",
    placeholder: "programming",
    helpText: "Subreddit name (without r/)",
    buildPath: (u) => `reddit/hot/${u.replace(/^r\//, "")}`,
    validate: (u) => {
      const clean = u.replace(/^r\//, "");
      if (!clean) return "Subreddit name is required";
      return null;
    },
  },
  {
    id: "github",
    name: "GitHub",
    icon: "🐙",
    placeholder: "diygod",
    helpText: "Username (new repos) or user/repo (specific repo)",
    buildPath: (u) => {
      if (u.includes("/")) return `github/repos/${u}`;
      return `github/repos/${u}`;
    },
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "🎵",
    placeholder: "billieeilish",
    helpText: "TikTok username (without @)",
    buildPath: (u) => `tiktok/user/${u.replace(/^@/, "")}`,
  },
  {
    id: "bluesky",
    name: "Bluesky",
    icon: "🦋",
    placeholder: "bsky.app",
    helpText: "Bluesky handle (e.g. bsky.app or username.bsky.social)",
    buildPath: (u) => `bsky/app/profile/${u.replace(/^@/, "")}`,
  },
  {
    id: "twitch",
    name: "Twitch",
    icon: "🟣",
    placeholder: "shroud",
    helpText: "Twitch username",
    buildPath: (u) => `twitch/user/${u}`,
  },
];

interface TestResult {
  ok: boolean;
  error?: string;
  itemCount?: number;
  items?: { title: string; link: string }[];
  url?: string;
}

interface Props {
  rsshubUrl: string;
  onAdd: (source: { url: string; label: string; enabled: boolean }) => void;
  onClose: () => void;
}

export default function SocialSetupWizard({ rsshubUrl, onAdd, onClose }: Props) {
  const [step, setStep] = useState<"pick" | "input" | "test" | "confirm">("pick");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const feedPath = platform?.buildPath(input) ?? "";

  const handlePick = (p: Platform) => {
    setPlatform(p);
    setInput("");
    setLabel("");
    setTestResult(null);
    setInputError(null);
    setStep("input");
  };

  const handleTest = async () => {
    if (platform?.validate) {
      const err = platform.validate(input);
      if (err) { setInputError(err); return; }
    }
    setInputError(null);
    setStep("test");
    setTesting(true);
    try {
      const result = await api.testFeed(rsshubUrl, feedPath);
      setTestResult(result);
      if (result.ok && !label) {
        setLabel(input.replace(/^@/, ""));
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd({ url: feedPath, label: label.trim(), enabled: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-discord-card border border-discord-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-discord-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Add Social Feed</h2>
            <button onClick={onClose} className="text-discord-muted hover:text-discord-text text-xl leading-none">&times;</button>
          </div>
          {/* Progress dots */}
          <div className="flex gap-2 mt-3">
            {(["pick", "input", "test", "confirm"] as const).map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step === s ? "bg-discord-accent" : i < ["pick", "input", "test", "confirm"].indexOf(step) ? "bg-discord-accent/40" : "bg-discord-input"}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[200px]">

          {/* Step 1: Pick platform */}
          {step === "pick" && (
            <div className="space-y-2">
              <p className="text-sm text-discord-muted mb-3">Which platform?</p>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePick(p)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-discord-input border border-discord-border hover:border-discord-accent/50 transition-colors text-left"
                  >
                    <span className="text-2xl">{p.icon}</span>
                    <span className="font-medium text-sm">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Enter username */}
          {step === "input" && platform && (
            <div className="space-y-4">
              <button onClick={() => setStep("pick")} className="text-sm text-discord-muted hover:text-discord-text">&larr; Back</button>
              <div>
                <p className="text-sm text-discord-muted mb-1">Platform: <span className="text-discord-text font-medium">{platform.icon} {platform.name}</span></p>
                <h3 className="font-semibold">Enter {platform.id === "reddit" ? "subreddit" : "username"}</h3>
                <p className="text-xs text-discord-muted mt-0.5">{platform.helpText}</p>
              </div>
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(null); }}
                onKeyDown={(e) => e.key === "Enter" && input.trim() && handleTest()}
                placeholder={platform.placeholder}
                autoFocus
                className="w-full px-4 py-3 bg-discord-input border border-discord-border rounded-xl text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent text-lg"
              />
              {inputError && <p className="text-sm text-discord-red">{inputError}</p>}
              <button
                onClick={handleTest}
                disabled={!input.trim()}
                className="w-full btn-primary py-3 disabled:opacity-40"
              >
                Test Feed &rarr;
              </button>
            </div>
          )}

          {/* Step 3: Testing */}
          {step === "test" && (
            <div className="space-y-4">
              <div className="text-center py-6">
                {testing ? (
                  <>
                    <div className="inline-block w-8 h-8 border-2 border-discord-accent border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-discord-muted">Testing feed...</p>
                    <p className="text-xs text-discord-muted/60 mt-1 font-mono">{rsshubUrl}/{feedPath}</p>
                  </>
                ) : testResult?.ok ? (
                  <>
                    <div className="text-4xl mb-2">✅</div>
                    <p className="font-semibold text-discord-green">Feed works!</p>
                    <p className="text-sm text-discord-muted mt-1">{testResult.itemCount} item(s) found</p>
                    {testResult.items && testResult.items.length > 0 && (
                      <div className="mt-3 text-left bg-discord-input rounded-lg p-3 space-y-1.5">
                        {testResult.items.map((item, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-discord-text font-medium">{item.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setStep("confirm")} className="w-full btn-primary py-3 mt-4">
                      Continue &rarr;
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-2">❌</div>
                    <p className="font-semibold text-discord-red">Feed failed</p>
                    <p className="text-sm text-discord-muted mt-1">{testResult?.error}</p>
                    {platform?.id === "instagram" && (
                      <div className="mt-3 p-3 bg-discord-input rounded-lg text-left text-xs text-discord-muted space-y-1">
                        <p className="font-medium text-discord-text">Instagram requires a session cookie</p>
                        <p>1. Log into Instagram in your browser</p>
                        <p>2. F12 → Application → Cookies → sessionid</p>
                        <p>3. Set <code className="text-discord-accent">INSTAGRAM_COOKIE</code> in your RSSHub env</p>
                        <p>4. Restart RSSHub container</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => { setStep("input"); setTestResult(null); }} className="btn-secondary flex-1">
                        &larr; Try Again
                      </button>
                      <button onClick={onClose} className="btn-secondary flex-1">
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === "confirm" && (
            <div className="space-y-4">
              <button onClick={() => setStep("test")} className="text-sm text-discord-muted hover:text-discord-text">&larr; Back</button>
              <div>
                <h3 className="font-semibold">Name this feed</h3>
                <p className="text-xs text-discord-muted mt-0.5">This label appears in Discord embeds</p>
              </div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && label.trim() && handleAdd()}
                placeholder="e.g. National Geographic"
                autoFocus
                className="w-full px-4 py-3 bg-discord-input border border-discord-border rounded-xl text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent text-lg"
              />
              <div className="bg-discord-input rounded-lg p-3 text-xs font-mono text-discord-muted">
                {rsshubUrl}/{feedPath}
              </div>
              <button
                onClick={handleAdd}
                disabled={!label.trim()}
                className="w-full btn-primary py-3 disabled:opacity-40"
              >
                Add Feed
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
