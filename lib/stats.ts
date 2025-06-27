import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function getTotalUsers() {
  return prisma.user.count();
}

export async function getMessagesInLast30Minutes() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return prisma.message.count({
    where: {
      created_at: {
        gte: thirtyMinutesAgo,
      },
    },
  });
}

type ToolInvocation = {
  toolName: string;
  [key: string]: any;
};

export async function getToolCallStats() {
  const messagesWithTools = await prisma.message.findMany({
    where: {
      tool_invocations: {
        not: Prisma.JsonNull,
      },
    },
    select: {
      tool_invocations: true,
    },
  });

  const toolCounts: { [key: string]: number } = {};

  for (const message of messagesWithTools) {
    const invocations = message.tool_invocations;

    if (Array.isArray(invocations)) {
      for (const invocation of invocations) {
        if (
          invocation &&
          typeof invocation === 'object' &&
          'toolName' in invocation &&
          typeof (invocation as any).toolName === 'string'
        ) {
          const toolName = (invocation as ToolInvocation).toolName;
          toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
        }
      }
    }
  }

  const toolCallStats = Object.entries(toolCounts)
    .map(([toolName, count]) => ({
      toolName,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return toolCallStats;
}
