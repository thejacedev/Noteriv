# The Noteriv MCP server in a container, for registries that check a server
# by building and starting it, such as Glama. It is not needed to use the
# server: `npx noteriv-mcp` is the usual way (see README.md).
#
# Build from the top of the repository:
#   docker build -f mcp/Dockerfile -t noteriv-mcp .
#
# Run it on a vault folder mounted at /vault. It talks MCP over stdin and
# stdout, so `-i` is needed:
#   docker run -i --rm -v /path/to/vault:/vault noteriv-mcp /vault
#
# Without a vault it still starts and lists its tools; a client then picks a
# folder with the set_vault_path tool.

FROM node:22-alpine

WORKDIR /app

# Dependencies first, so a change to the server alone does not reinstall them.
COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY mcp/index.js mcp/server.json ./

# Not root: the server only reads and writes the vault it is given.
USER node

ENTRYPOINT ["node", "index.js"]
