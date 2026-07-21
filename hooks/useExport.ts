import { useState, useCallback } from "react";
import toast from "react-hot-toast";

interface UseExportOptions {
  workspaceId: string;
}

export function useExport({ workspaceId }: UseExportOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const triggerExport = useCallback(
    async (assetId: string, revisionId: string, annotations: any[]) => {
      setIsExporting(true);
      setExportProgress(10);
      try {
        const res = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            sourceAssetId: assetId,
            sourceRevisionId: revisionId,
            jobType: "pdf_save_back",
            inputJson: { annotations },
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to start export job");
        }

        const data = await res.json();
        const jobId = data.data?.jobId || data.jobId;
        
        // Poll for status
        return await new Promise<string>((resolve, reject) => {
          const poll = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/export/${jobId}`);
              const statusData = await statusRes.json();
              const jobInfo = statusData.data || statusData;

              if (jobInfo.status === "done") {
                clearInterval(poll);
                setIsExporting(false);
                setExportProgress(100);
                toast.success("Saved perfectly!");
                resolve(jobInfo.targetRevisionId);
              } else if (jobInfo.status === "failed") {
                clearInterval(poll);
                setIsExporting(false);
                toast.error(`Export failed: ${jobInfo.errorMessage || 'Unknown error'}`);
                reject(new Error(jobInfo.errorMessage));
              } else {
                setExportProgress((p) => Math.min(p + 10, 90));
              }
            } catch (err) {
              clearInterval(poll);
              setIsExporting(false);
              toast.error("Failed to check export status");
              reject(err);
            }
          }, 2000);
        });
      } catch (error: any) {
        setIsExporting(false);
        toast.error(error.message || "Failed to trigger export");
        throw error;
      }
    },
    [workspaceId]
  );

  return {
    isExporting,
    exportProgress,
    triggerExport,
  };
}
