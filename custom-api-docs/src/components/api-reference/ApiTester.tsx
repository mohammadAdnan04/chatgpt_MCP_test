"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Play, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ApiTesterProps {
  method: string;
  path: string;
  body?: any;
}

export function ApiTester({ method, path, body }: ApiTesterProps) {
  const { resolvedTheme } = useTheme();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    time: number;
    data: any;
  } | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    
    const startTime = performance.now();
    try {
      // Use coolsearch for the search endpoint, and apicool for everything else (enrichment)
      const baseUrl = path.startsWith("/search") 
        ? "https://coolsearch.mawsool.tech" 
        : "https://apicool.mawsool.tech";
        
      const url = `${baseUrl}${path}`;
      
      const options: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {})
        }
      };

      if (body && method.toUpperCase() !== "GET") {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      const endTime = performance.now();
      
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        time: Math.round(endTime - startTime),
        data
      });
    } catch (error: any) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        time: 0,
        data: { error: error.message || "Failed to fetch" }
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "bg-green-500/10 text-green-500";
    if (status >= 400 && status < 500) return "bg-yellow-500/10 text-yellow-500";
    if (status >= 500) return "bg-red-500/10 text-red-500";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="apiKey">API Key (X-API-Key)</Label>
            <Input 
              id="apiKey" 
              type="password" 
              placeholder="Your Mawsool API Key" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <Button onClick={handleSend} disabled={loading} className="w-24">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Play className="mr-2 h-4 w-4" /> Send
              </>
            )}
          </Button>
        </div>
      </div>

      {response && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center gap-4 border-b px-4 py-3 bg-muted/50">
            <Badge variant="outline" className={getStatusColor(response.status)}>
              {response.status} {response.statusText}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {response.time} ms
            </span>
          </div>
          <div className="p-4 bg-[#1E1E1E]">
            <Editor
              height="300px"
              language="json"
              theme="vs-dark"
              value={typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                wordWrap: "on"
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
