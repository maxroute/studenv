let clientPdfJsPromise: Promise<any> | null = null;

export async function getClientPdfJs(): Promise<any> {
  if (typeof window === "undefined") return null;

  if (!clientPdfJsPromise) {
    const pdfLibUrl = new URL(
      "/api/pdfjs-lib",
      window.location.origin,
    ).toString();
    clientPdfJsPromise = import(/* webpackIgnore: true */ pdfLibUrl).then(
      (lib) => {
        const pdfjsLib = (lib as any).default ?? lib;

        if (pdfjsLib?.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
        }

        return pdfjsLib;
      },
    );
  }

  return clientPdfJsPromise;
}
