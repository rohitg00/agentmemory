# agentmemory Helm Chart

This chart deploys agentmemory on Kubernetes with the same single-container model used by the Fly, Railway, Render, and Coolify templates.

The chart does not publish or assume an official container image. Build an image from one of the existing deploy Dockerfiles, push it to a registry your cluster can pull from, and pass that image repository to Helm.

## Prerequisites

- Helm 3
- Kubernetes cluster with `ReadWriteOnce` persistent volume support
- Container registry reachable by the cluster
- An agentmemory image built from the existing deploy Dockerfile pattern

Build an image:

```bash
docker build -f deploy/fly/Dockerfile \
  --build-arg AGENTMEMORY_VERSION=0.9.27 \
  --build-arg III_VERSION=0.11.2 \
  --build-arg III_SDK_VERSION=0.11.2 \
  -t registry.example.com/agentmemory:0.9.27 \
  deploy/fly
docker push registry.example.com/agentmemory:0.9.27
```

## Install

```bash
helm install agentmemory deploy/helm/agentmemory \
  --set image.repository=registry.example.com/agentmemory \
  --set image.tag=0.9.27
```

The default chart creates one replica, one `ReadWriteOnce` PVC mounted at `/data`, and one ClusterIP Service exposing only port `3111`. The chart fails fast if `replicaCount` is set above `1` or if `persistence.mountPath` is changed because the deploy image and file-backed SQLite state use a single `/data` directory. This is intentionally a single-replica deployment.

Verify the REST API:

```bash
kubectl port-forward svc/agentmemory 3111:3111
curl http://127.0.0.1:3111/agentmemory/livez
```

## HMAC Secret

By default, the entrypoint generates the HMAC secret on first boot and stores it at `/data/.hmac` with restrictive permissions. The value is not printed to platform logs.

Retrieve it from the running pod:

```bash
kubectl exec deployment/agentmemory -- sh -c 'cat /data/.hmac'
```

For production, create or sync a Kubernetes Secret outside Helm so the value is not stored in Helm values or release history. Then tell the chart which key contains the HMAC. The chart mounts that key as a file and sets `AGENTMEMORY_HMAC_FILE` because the deploy entrypoint loads the HMAC from a file before starting agentmemory.

```bash
kubectl create secret generic agentmemory-secrets \
  --from-file=hmac=./agentmemory.hmac

helm upgrade --install agentmemory deploy/helm/agentmemory \
  --set image.repository=registry.example.com/agentmemory \
  --set image.tag=0.9.27 \
  --set secret.existingSecret=agentmemory-secrets \
  --set secret.existingKeys.hmac=hmac
```

For quick local smoke tests, `secret.agentmemorySecret` can create a Helm-managed HMAC Secret. Avoid that path for long-lived operational secrets because Helm stores release values and rendered manifests.

## Optional Provider Keys

The service runs without LLM or embedding keys. To enable provider-backed compression or embeddings, create or sync a Kubernetes Secret and point the chart at its key names:

```bash
kubectl create secret generic agentmemory-secrets \
  --from-file=openai-api-key=./openai-api-key

helm upgrade --install agentmemory deploy/helm/agentmemory \
  --set image.repository=registry.example.com/agentmemory \
  --set image.tag=0.9.27 \
  --set secret.existingSecret=agentmemory-secrets \
  --set secret.existingKeys.openaiApiKey=openai-api-key \
  --set env.EMBEDDING_PROVIDER=openai \
  --set env.AGENTMEMORY_AUTO_COMPRESS=true
```

Provider keys are only supported through `secret.existingSecret` and `secret.existingKeys.*`. Do not pass provider API keys as Helm literal values; doing so would store them in values files, shell history, rendered manifests, or Helm release metadata.

## Viewer Access

The Service intentionally exposes only the REST API on `3111`. The viewer on `3113` stays internal to the pod. Use a Deployment or pod port-forward:

```bash
kubectl port-forward deployment/agentmemory 3113:3113
open http://127.0.0.1:3113
```

## Ingress

Ingress is disabled by default and targets only the REST API Service port:

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: agentmemory.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - agentmemory.example.com
      secretName: agentmemory-tls
```

When ingress is enabled, configure at least one non-empty host with at least one slash-prefixed path. Use HTTPS or an equivalent private tunnel for bearer-authenticated non-loopback clients. The MCP shim refuses to send bearer auth over plaintext HTTP to non-loopback hosts when `AGENTMEMORY_REQUIRE_HTTPS=1` is enabled.

## Network Policy

The chart renders a NetworkPolicy by default that allows inbound traffic only to the REST API port. This keeps the viewer, streams, iii-engine bridge, and metrics ports off the pod network path in clusters with NetworkPolicy enforcement. Set `networkPolicy.enabled=false` only when your namespace already has equivalent default-deny controls or your cluster does not support NetworkPolicy.

## Persistence And Upgrades

The PVC stores `state_store.db`, `stream_store/`, and `.hmac`. The chart uses a `Recreate` deployment strategy by default so a single `ReadWriteOnce` volume is not attached to multiple pods during upgrades.

Upgrade with the same image repository and the new tag:

```bash
helm upgrade agentmemory deploy/helm/agentmemory \
  --set image.repository=registry.example.com/agentmemory \
  --set image.tag=0.9.28
```

By default, Helm deletes chart-managed PVCs on uninstall. To keep memories after uninstalling the release, either use `persistence.existingClaim` or preserve the chart-created claim with a Helm resource-policy annotation:

```yaml
persistence:
  annotations:
    helm.sh/resource-policy: keep
```

Keep a separate backup of the PVC before destructive cluster or storage operations.

## Values

| Value | Default | Purpose |
| --- | --- | --- |
| `replicaCount` | `1` | Must remain `1`; file-backed SQLite state supports one writer. |
| `image.repository` | `""` | Required; set to your pushed image repository. |
| `image.tag` | `0.9.27` | Agentmemory image tag. |
| `service.port` | `3111` | REST API Service port. |
| `persistence.enabled` | `true` | Create a PVC for `/data`. |
| `persistence.mountPath` | `/data` | Must remain `/data`; deploy images and iii config use this directory. |
| `persistence.size` | `1Gi` | PVC size. |
| `persistence.fixPermissions` | `false` | Optional BusyBox init container; normally unnecessary because the entrypoint chowns `/data`. |
| `networkPolicy.enabled` | `true` | Allow inbound traffic only to REST port `3111` in enforcing clusters. |
| `secret.existingSecret` | `""` | Existing Kubernetes Secret for HMAC/provider keys. |
| `secret.existingKeys.hmac` | `""` | Existing Secret key mounted as the HMAC file. |
| `secret.existingKeys.openaiApiKey` | `""` | Existing Secret key used for `OPENAI_API_KEY`. |
| `secret.agentmemorySecret` | `""` | Optional fixed HMAC value, mounted as a file. |
| `ingress.enabled` | `false` | Optional REST API ingress. |
