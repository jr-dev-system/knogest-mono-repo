import { createPrismaClient } from "../src/db/prisma.db";

const [command, sessionId] = process.argv.slice(2);
if (!sessionId || !/^[0-9a-f-]{36}$/iu.test(sessionId))
  throw new Error("A valid Session id is required");

async function main() {
  const { prisma, pool } = createPrismaClient();
  try {
    if (command === "get") {
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: { refreshVersion: true, revokedAt: true },
      });
      process.stdout.write(
        JSON.stringify({
          refreshVersion: session.refreshVersion,
          revokedAt: session.revokedAt?.toISOString() ?? null,
        }),
      );
    } else if (command === "revoke") {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
          revocationReason: "e2e-terminal-refresh",
          refreshTokenHash: null,
        },
      });
    } else {
      throw new Error("Expected get or revoke command");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
