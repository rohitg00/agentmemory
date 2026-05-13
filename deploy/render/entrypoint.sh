#!/bin/sh
# agentmemory first-boot entrypoint.
#
# On first boot, generates a 256-bit HMAC secret with openssl rand,
# writes it to ${AGENTMEMORY_HMAC_FILE} (default /data/.hmac, chmod 600),
# and prints it to stdout exactly once so the operator can capture it
# from the platform's deploy logs. On subsequent boots the file already
# exists and we just load it.
#
# To rotate: delete the file and restart the service. The next boot
# will print a fresh secret.

set -eu

HMAC_FILE="${AGENTMEMORY_HMAC_FILE:-/data/.hmac}"
DATA_DIR="${AGENTMEMORY_DATA_DIR:-/data}"

mkdir -p "${DATA_DIR}"

if [ ! -s "${HMAC_FILE}" ]; then
  SECRET="$(openssl rand -hex 32)"
  umask 077
  printf '%s\n' "${SECRET}" > "${HMAC_FILE}"
  chmod 600 "${HMAC_FILE}"
  echo "================================================================"
  echo "agentmemory: generated HMAC secret on first boot"
  echo "AGENTMEMORY_SECRET=${SECRET}"
  echo "Copy this value now. It will not be printed again."
  echo "Stored at: ${HMAC_FILE} (chmod 600)"
  echo "To rotate: delete ${HMAC_FILE} on the persistent volume and restart."
  echo "================================================================"
fi

AGENTMEMORY_SECRET="$(cat "${HMAC_FILE}")"
export AGENTMEMORY_SECRET

exec agentmemory "$@"
