import { embed } from "@/lib/ai/embeddings";
import * as indexRepository from "@/lib/repositories/rangan-index.repository";
import { createRanganIndexService } from "@/lib/services/rangan-index.service";

/** Rangan's library index wired to the database and Cloudflare embeddings. */
export const ranganIndex = createRanganIndexService({ ...indexRepository, embed });
