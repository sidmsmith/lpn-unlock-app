// api/stats.js - Vercel Analytics Stats Endpoint
import fetch from 'node-fetch';

const VERCEL_API_BASE = 'https://api.vercel.com';
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const PROJECT_NAME = 'lpn-unlock-app';
const PROJECT_URL = 'https://lpnlock.vercel.app';

/**
 * Fetch project information from Vercel API
 */
async function getProjectInfo() {
  if (!VERCEL_API_TOKEN) {
    return { error: 'VERCEL_API_TOKEN environment variable not set' };
  }

  try {
    // Get project ID by listing projects
    const projectsResponse = await fetch(`${VERCEL_API_BASE}/v9/projects`, {
      headers: {
        'Authorization': `Bearer ${VERCEL_API_TOKEN}`
      }
    });

    if (!projectsResponse.ok) {
      return { error: `Failed to fetch projects: ${projectsResponse.status}` };
    }

    const projectsData = await projectsResponse.json();
    const project = projectsData.projects?.find(p => 
      p.name?.toLowerCase() === PROJECT_NAME.toLowerCase()
    );

    if (!project) {
      return { error: `Project ${PROJECT_NAME} not found` };
    }

    // Get latest deployment
    const deploymentsResponse = await fetch(
      `${VERCEL_API_BASE}/v6/deployments?projectId=${project.id}&limit=1&target=production&state=READY`,
      {
        headers: {
          'Authorization': `Bearer ${VERCEL_API_TOKEN}`
        }
      }
    );

    let deployment = null;
    if (deploymentsResponse.ok) {
      const deploymentsData = await deploymentsResponse.json();
      deployment = deploymentsData.deployments?.[0] || null;
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        url: PROJECT_URL
      },
      deployment: deployment ? {
        id: deployment.id,
        url: deployment.url,
        created: deployment.createdAt,
        state: deployment.state
      } : null
    };
  } catch (error) {
    return { error: `API error: ${error.message}` };
  }
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const projectInfo = await getProjectInfo();

  // Note: Vercel Analytics data (visitors, page views) is NOT available via API
  // This endpoint returns project/deployment metadata only
  const response = {
    project: PROJECT_NAME,
    url: PROJECT_URL,
    note: 'Analytics data (visitors, page views) is only available in Vercel dashboard. This endpoint provides project metadata only.',
    ...projectInfo,
    last_updated: new Date().toISOString()
  };

  return res.status(200).json(response);
}

