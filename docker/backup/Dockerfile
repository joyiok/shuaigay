FROM postgres:17-alpine
RUN apk add --no-cache restic curl tzdata
COPY backup.sh restore.sh pre-dump.sh ai-automation.sh novel-automation.sh /scripts/
COPY crontab /etc/crontabs/root
CMD ["crond", "-f", "-l", "8"]
