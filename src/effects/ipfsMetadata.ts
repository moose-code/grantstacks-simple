import { createEffect, S } from "envio";

const IPFS_GATEWAYS = [
  "https://d16c97c2np8a2o.cloudfront.net/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

// Output is arbitrary JSON — store as a JSON string in the cache
// Handlers must JSON.parse the result
export const ipfsMetadataEffect = createEffect({
  name: "ipfsMetadata",
  input: S.string,
  output: S.nullable(S.string),
  cache: true,
  rateLimit: { calls: 50, per: "second" },
}, async ({ input: cid }) => {
  if (!cid || cid === "") return undefined;

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const response = await fetch(`${gateway}${cid}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        // Strip null bytes and other invalid Unicode that PostgreSQL rejects
        return text.replace(/\0/g, "").replace(/\\u0000/g, "");
      }
    } catch {
      continue;
    }
  }

  return undefined;
});

/** Parse the string result from ipfsMetadataEffect into a JSON value */
export function parseIpfsResult(result: string | undefined): unknown {
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}
