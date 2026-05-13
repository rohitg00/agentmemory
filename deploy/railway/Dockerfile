FROM rohitghumare64/agentmemory:latest

ENV AGENTMEMORY_REQUIRE_HTTPS=1 \
    AGENTMEMORY_HMAC_FILE=/data/.hmac \
    AGENTMEMORY_DATA_DIR=/data

COPY --chmod=0755 --chown=65532:65532 entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

USER 65532:65532

EXPOSE 3111

ENTRYPOINT ["/usr/local/bin/agentmemory-entrypoint.sh"]
