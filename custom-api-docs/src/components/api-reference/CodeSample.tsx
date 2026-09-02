"use client";

import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface CodeSampleProps {
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
}

export function CodeSample({ method, path, body, headers = {} }: CodeSampleProps) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  
  // Use coolsearch for the search endpoint, and apicool for everything else (enrichment)
  const baseUrl = path.startsWith("/search") 
    ? "https://coolsearch.mawsool.tech" 
    : "https://apicool.mawsool.tech";
    
  const url = `${baseUrl}${path}`;
  
  const getCurlSnippet = () => {
    let snippet = `curl -X ${method.toUpperCase()} "${url}"`;
    
    // Add headers
    const allHeaders = { ...headers, "Content-Type": "application/json" };
    for (const [key, value] of Object.entries(allHeaders)) {
      snippet += ` \\\n  -H "${key}: ${value}"`;
    }
    
    // Add body
    if (body && Object.keys(body).length > 0 && method.toUpperCase() !== "GET") {
      snippet += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
    }
    
    return snippet;
  };
  
  const getJsSnippet = () => {
    let snippet = `const options = {
  method: '${method.toUpperCase()}',
  headers: ${JSON.stringify({ ...headers, "Content-Type": "application/json" }, null, 4).replace(/\n/g, '\n  ')}
};\n`;

    if (body && Object.keys(body).length > 0 && method.toUpperCase() !== "GET") {
      snippet += `\noptions.body = JSON.stringify(${JSON.stringify(body, null, 2)});\n`;
    }
    
    snippet += `\nfetch('${url}', options)
  .then(response => response.json())
  .then(response => console.log(response))
  .catch(err => console.error(err));`;
  
    return snippet;
  };

  const getPythonSnippet = () => {
    let snippet = `import requests\n\nurl = "${url}"\n\n`;
    
    if (body && Object.keys(body).length > 0 && method.toUpperCase() !== "GET") {
      snippet += `payload = ${JSON.stringify(body, null, 4)}\n`;
    }
    
    snippet += `headers = ${JSON.stringify({ ...headers, "Content-Type": "application/json" }, null, 4)}\n\n`;
    
    snippet += `response = requests.request("${method.toUpperCase()}", url, json=payload, headers=headers)\n\n`;
    snippet += `print(response.text)`;
    
    return snippet;
  };

  const snippets = {
    cURL: getCurlSnippet(),
    JavaScript: getJsSnippet(),
    Python: getPythonSnippet(),
  };

  const [activeTab, setActiveTab] = useState("cURL");

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab as keyof typeof snippets]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/50">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="h-8 bg-transparent p-0">
              {Object.keys(snippets).map((lang) => (
                <TabsTrigger
                  key={lang}
                  value={lang}
                  className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground h-8 px-3 text-xs"
                >
                  {lang}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </Tabs>
      </div>
      <div className="p-4 bg-[#1E1E1E]">
        <Editor
          height="200px"
          language={activeTab === "JavaScript" ? "javascript" : activeTab === "Python" ? "python" : "shell"}
          theme="vs-dark"
          value={snippets[activeTab as keyof typeof snippets]}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "off",
            folding: false,
            padding: { top: 8, bottom: 8 }
          }}
        />
      </div>
    </div>
  );
}
