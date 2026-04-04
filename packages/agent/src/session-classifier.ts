import type { SessionType } from '@pulse/shared';

interface ClassifyInput {
  entrypoint: string;
  userType: string;
}

export function classifySession(input: ClassifyInput): SessionType {
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI || process.env.JENKINS_URL) {
    return 'agent_local';
  }
  if (input.entrypoint === 'api') {
    return 'agent_local';
  }
  return 'human';
}
