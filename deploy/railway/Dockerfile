FROM rohitghumare64/agentmemory:latest

ENV AGENTMEMORY_REQUIRE_HTTPS=1 \
    AGENTMEMORY_HMAC_FILE=/data/.hmac \
    AGENTMEMORY_DATA_DIR=/data

COPY entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

USER root
RUN chmod +x /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111

ENTRYPOINT ["/usr/local/bin/agentmemory-entrypoint.sh"]
