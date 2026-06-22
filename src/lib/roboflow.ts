import "server-only";

export type RoboflowDetection = {
  className: string;
  confidence: number;
  height: number;
  width: number;
  x: number;
  y: number;
};

export type RoboflowDetectionResult = {
  confidenceThreshold: number;
  detections: RoboflowDetection[];
  image: {
    height: number | null;
    width: number | null;
  };
  raw: unknown;
  workflow: {
    apiUrl: string;
    workspace: string;
    workflowId: string;
  };
};

type RunRoboflowDetectionInput = {
  confidenceThreshold: number;
  image: {
    buffer: Buffer;
  };
};

const defaultApiUrl = "https://detect.roboflow.com";
const defaultWorkspace = "ckrcks00-gmail-com";
const defaultWorkflowId = "find-champion_icon-team_result-and-more";
const requestTimeoutMs = 15000;

export class RoboflowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoboflowConfigError";
  }
}

export async function runRoboflowDetection({
  confidenceThreshold,
  image,
}: RunRoboflowDetectionInput): Promise<RoboflowDetectionResult> {
  const config = getRoboflowConfig();
  const responseJson = await postWorkflowRequest({
    config,
    image,
  });
  const detections = extractDetections(responseJson).filter((detection) => detection.confidence >= confidenceThreshold);
  const imageSize = extractImageSize(responseJson);

  return {
    confidenceThreshold,
    detections,
    image: imageSize,
    raw: trimLargeStrings(responseJson),
    workflow: {
      apiUrl: config.apiUrl,
      workspace: config.workspace,
      workflowId: config.workflowId,
    },
  };
}

function getRoboflowConfig() {
  const apiUrl = normalizeApiUrl(process.env.ROBOFLOW_API_URL ?? defaultApiUrl);
  const apiKey = process.env.ROBOFLOW_API_KEY;
  const workspace = process.env.ROBOFLOW_WORKSPACE ?? defaultWorkspace;
  const workflowId = process.env.ROBOFLOW_WORKFLOW_ID ?? defaultWorkflowId;

  if (!apiKey) {
    throw new RoboflowConfigError("ROBOFLOW_API_KEY is not configured.");
  }
  if (!workspace) {
    throw new RoboflowConfigError("ROBOFLOW_WORKSPACE is not configured.");
  }
  if (!workflowId) {
    throw new RoboflowConfigError("ROBOFLOW_WORKFLOW_ID is not configured.");
  }

  return { apiKey, apiUrl, workspace, workflowId };
}

async function postWorkflowRequest({
  config,
  image,
}: {
  config: ReturnType<typeof getRoboflowConfig>;
  image: RunRoboflowDetectionInput["image"];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const endpoint = `${config.apiUrl}/infer/workflows/${encodeURIComponent(config.workspace)}/${encodeURIComponent(config.workflowId)}`;

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        api_key: config.apiKey,
        inputs: {
          image: {
            type: "base64",
            value: image.buffer.toString("base64"),
          },
        },
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    const responseText = await response.text();
    const responseJson = parseJsonResponse(responseText);

    if (!response.ok) {
      throw new Error(
        `Roboflow request failed with ${response.status}: ${getRoboflowErrorMessage(responseJson) ?? response.statusText}`,
      );
    }

    return responseJson;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Roboflow request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeApiUrl(value: string) {
  return value.replace(/\/+$/, "") || defaultApiUrl;
}

function parseJsonResponse(responseText: string) {
  if (!responseText) return null;

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

function getRoboflowErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const message = value.message ?? value.error ?? value.detail;
  return typeof message === "string" ? message : null;
}

function extractDetections(value: unknown) {
  const detections: RoboflowDetection[] = [];
  const visited = new Set<unknown>();

  function visit(node: unknown) {
    if (!node || visited.has(node)) return;
    if (typeof node === "object") visited.add(node);

    if (Array.isArray(node)) {
      if (node.every(isDetectionLike)) {
        detections.push(...node.map(normalizeDetection));
        return;
      }

      node.forEach(visit);
      return;
    }

    if (!isRecord(node)) return;
    Object.values(node).forEach(visit);
  }

  visit(value);

  return detections;
}

function isDetectionLike(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof getNumber(value.x) === "number" &&
    typeof getNumber(value.y) === "number" &&
    typeof getNumber(value.width) === "number" &&
    typeof getNumber(value.height) === "number" &&
    typeof getClassName(value) === "string"
  );
}

function normalizeDetection(value: unknown): RoboflowDetection {
  if (!isRecord(value)) {
    return {
      className: "unknown",
      confidence: 0,
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    };
  }

  return {
    className: getClassName(value) ?? "unknown",
    confidence: normalizeConfidence(getNumber(value.confidence) ?? getNumber(value.score) ?? getNumber(value.probability) ?? 0),
    height: getNumber(value.height) ?? 0,
    width: getNumber(value.width) ?? 0,
    x: getNumber(value.x) ?? 0,
    y: getNumber(value.y) ?? 0,
  };
}

function getClassName(value: Record<string, unknown>) {
  const className = value.class ?? value.class_name ?? value.label ?? value.name;
  return typeof className === "string" ? className : null;
}

function normalizeConfidence(value: number) {
  if (value > 1) return value / 100;
  if (value < 0) return 0;
  return value;
}

function extractImageSize(value: unknown): { height: number | null; width: number | null } {
  const visited = new Set<unknown>();

  function visit(node: unknown): { height: number; width: number } | null {
    if (!node || visited.has(node)) return null;
    if (typeof node === "object") visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const size = visit(item);
        if (size) return size;
      }
      return null;
    }

    if (!isRecord(node)) return null;

    const width = getNumber(node.width);
    const height = getNumber(node.height);
    if (width && height && (node.image || node.original_image || node.originalImage || node.dimensions)) {
      return { height, width };
    }

    const image = node.image ?? node.original_image ?? node.originalImage ?? node.dimensions;
    if (isRecord(image)) {
      const imageWidth = getNumber(image.width);
      const imageHeight = getNumber(image.height);
      if (imageWidth && imageHeight) return { height: imageHeight, width: imageWidth };
    }

    for (const child of Object.values(node)) {
      const size = visit(child);
      if (size) return size;
    }

    return null;
  }

  const size = visit(value);
  return {
    height: size?.height ?? null,
    width: size?.width ?? null,
  };
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function trimLargeStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}... [trimmed ${value.length - 2000} chars]` : value;
  }
  if (Array.isArray(value)) return value.map(trimLargeStrings);
  if (!isRecord(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, trimLargeStrings(child)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
