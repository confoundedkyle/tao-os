"use client";

import { useState } from "react";

export function DownloadButtons({
  text,
  filename,
}: {
  text: string;
  filename: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function download(format: "md" | "docx") {
    setLoading(format);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename, format }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  }

  function printPdf() {
    const win = window.open("", "_blank");
    if (!win) return;

    const fmt = (s: string) =>
      s
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>");

    const lines = text.split("\n");
    let html = "";
    let i = 0;
    let inUl = false;
    let inOl = false;

    const closeList = () => {
      if (inUl) { html += "</ul>"; inUl = false; }
      if (inOl) { html += "</ol>"; inOl = false; }
    };

    while (i < lines.length) {
      const line = lines[i];

      const hm = line.match(/^(#{1,3}) (.+)/);
      if (hm) {
        closeList();
        const tag = `h${hm[1].length}`;
        html += `<${tag}>${fmt(hm[2])}</${tag}>`;
        i++; continue;
      }

      if (line.trimStart().startsWith("|")) {
        closeList();
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trimStart().startsWith("|")) {
          if (!lines[i].match(/^\s*\|[\s\-:|]+\|\s*$/)) {
            rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
          }
          i++;
        }
        if (rows.length) {
          html += "<table>";
          rows.forEach((cells, ri) => {
            const tag = ri === 0 ? "th" : "td";
            html += `<tr>${cells.map((c) => `<${tag}>${fmt(c)}</${tag}>`).join("")}</tr>`;
          });
          html += "</table>";
        }
        continue;
      }

      const bm = line.match(/^[ \t]*[-*] (.+)/);
      if (bm) {
        if (inOl) { html += "</ol>"; inOl = false; }
        if (!inUl) { html += "<ul>"; inUl = true; }
        html += `<li>${fmt(bm[1])}</li>`;
        i++; continue;
      }

      const om = line.match(/^\d+\. (.+)/);
      if (om) {
        if (inUl) { html += "</ul>"; inUl = false; }
        if (!inOl) { html += "<ol>"; inOl = true; }
        html += `<li>${fmt(om[1])}</li>`;
        i++; continue;
      }

      closeList();
      if (!line.trim()) { html += "<br>"; i++; continue; }
      html += `<p>${fmt(line)}</p>`;
      i++;
    }
    closeList();

    win.document.write(`<!DOCTYPE html><html><head>
      <title>${filename}</title>
      <style>
        body{font-family:Georgia,serif;max-width:700px;margin:40px auto;font-size:13px;line-height:1.6;color:#1b2a4a}
        h1{font-size:20px;margin:24px 0 8px}h2{font-size:16px;margin:20px 0 6px}h3{font-size:14px;margin:16px 0 4px}
        p{margin:4px 0}
        table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0}
        td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}
        ul,ol{padding-left:20px;margin:6px 0}li{margin:2px 0}
        code{font-family:monospace;font-size:11px;background:#f0f0f0;padding:1px 3px;border-radius:2px}
        @media print{body{margin:0}}
      </style>
    </head><body>${html}<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
    win.document.close();
  }

  const btnClass =
    "rounded-chip border border-navy-800/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy-800/75 shadow-sm transition hover:border-mint-700 hover:bg-mint-400/10 hover:text-mint-700 disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-navy-800/45">Download:</span>
      <button
        className={btnClass}
        onClick={() => download("md")}
        disabled={loading === "md"}
      >
        {loading === "md" ? "…" : "Markdown"}
      </button>
      <button
        className={btnClass}
        onClick={printPdf}
      >
        PDF
      </button>
      <button
        className={btnClass}
        onClick={() => download("docx")}
        disabled={loading === "docx"}
      >
        {loading === "docx" ? "…" : "DOCX"}
      </button>
    </div>
  );
}
