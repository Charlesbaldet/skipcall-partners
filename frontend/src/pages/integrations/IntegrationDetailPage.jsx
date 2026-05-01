import { useParams, Navigate } from 'react-router-dom';
import IntegrationPageTemplate from '../../components/IntegrationPageTemplate';
import { getIntegration } from './integrationsData';

export default function IntegrationDetailPage() {
  const { slug } = useParams();
  const integration = getIntegration(slug);
  if (!integration) return <Navigate to="/integrations" replace />;
  return <IntegrationPageTemplate integration={integration} />;
}
