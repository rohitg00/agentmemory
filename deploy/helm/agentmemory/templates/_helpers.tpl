{{/*
Validate values that would produce unsupported runtime topology.
*/}}
{{- define "agentmemory.validateValues" -}}
{{- if not (regexMatch "^1$" (toString .Values.replicaCount)) -}}
{{- fail "replicaCount must be 1 because agentmemory stores file-backed SQLite state in a single-writer data directory" -}}
{{- end -}}
{{- if ne (toString .Values.persistence.mountPath) "/data" -}}
{{- fail "persistence.mountPath must be /data because the deploy image and iii config use that data directory" -}}
{{- end -}}
{{- if and .Values.secret.agentmemorySecret .Values.secret.existingKeys.hmac -}}
{{- fail "secret.agentmemorySecret and secret.existingKeys.hmac are mutually exclusive; set one HMAC source" -}}
{{- end -}}
{{- if or .Values.secret.existingKeys.hmac .Values.secret.existingKeys.anthropicApiKey .Values.secret.existingKeys.openaiApiKey .Values.secret.existingKeys.geminiApiKey .Values.secret.existingKeys.voyageApiKey .Values.secret.existingKeys.openrouterApiKey -}}
{{- if not .Values.secret.existingSecret -}}
{{- fail "secret.existingSecret is required when any secret.existingKeys value is set" -}}
{{- end -}}
{{- end -}}
{{- if .Values.ingress.enabled -}}
{{- if not .Values.ingress.hosts -}}
{{- fail "ingress.hosts must include at least one host with paths when ingress.enabled=true" -}}
{{- end -}}
{{- range $index, $host := .Values.ingress.hosts -}}
{{- $hostName := default "" $host.host | toString | trim -}}
{{- if not $hostName -}}
{{- fail (printf "ingress.hosts[%d].host is required when ingress.enabled=true" $index) -}}
{{- end -}}
{{- if not $host.paths -}}
{{- fail (printf "ingress.hosts[%d].paths must include at least one path when ingress.enabled=true" $index) -}}
{{- end -}}
{{- range $pathIndex, $path := $host.paths -}}
{{- $pathValue := default "" $path.path | toString | trim -}}
{{- if not $pathValue -}}
{{- fail (printf "ingress.hosts[%d].paths[%d].path is required when ingress.enabled=true" $index $pathIndex) -}}
{{- end -}}
{{- if not (regexMatch "^/" $pathValue) -}}
{{- fail (printf "ingress.hosts[%d].paths[%d].path must start with /" $index $pathIndex) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Expand the chart name.
*/}}
{{- define "agentmemory.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "agentmemory.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "agentmemory.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "agentmemory.labels" -}}
helm.sh/chart: {{ include "agentmemory.chart" . }}
{{ include "agentmemory.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "agentmemory.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentmemory.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Service account name.
*/}}
{{- define "agentmemory.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "agentmemory.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Require an operator-supplied image repository. This repo ships Dockerfiles but
does not publish an official container image.
*/}}
{{- define "agentmemory.image" -}}
{{- $repository := required "image.repository is required; build an agentmemory image from deploy/fly/Dockerfile or another deploy Dockerfile, push it to a registry your cluster can pull from, and set image.repository" .Values.image.repository -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}

{{/*
Return true when this chart should render a managed Secret.
*/}}
{{- define "agentmemory.hasManagedSecret" -}}
{{- if .Values.secret.agentmemorySecret -}}
true
{{- end -}}
{{- end -}}

{{/*
PVC claim name for the data volume.
*/}}
{{- define "agentmemory.dataClaimName" -}}
{{- if .Values.persistence.existingClaim -}}
{{- .Values.persistence.existingClaim -}}
{{- else -}}
{{- include "agentmemory.fullname" . -}}
{{- end -}}
{{- end -}}
