FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

ARG RELEASE_ID=development
LABEL org.opencontainers.image.revision=$RELEASE_ID

# The upstream binary carries cap_net_bind_service. This deployment listens only
# on unprivileged container ports, and no-new-privileges correctly refuses to
# execute a capability-bearing binary after Compose drops every capability.
RUN setcap -r /usr/bin/caddy

USER 10001:10001
