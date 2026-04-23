import { useTranslation } from 'react-i18next';
import UseCasePageTemplate from '../../components/UseCasePageTemplate';
import { IconLayers, IconPalette, IconReport } from './icons';

export default function UseCaseAgencePage() {
  const { t } = useTranslation();
  const k = 'useCases.agence';

  return (
    <UseCasePageTemplate
      slug="agence-marketing"
      relatedSlugs={['reseau-distribution', 'marketplace-plateforme']}
      personaLabel={t('useCases.nav.agence')}
      helmet={{
        title: t(`${k}.metaTitle`),
        description: t(`${k}.metaDescription`),
      }}
      h1={t(`${k}.h1`)}
      subtitle={t(`${k}.subtitle`)}
      roiMain={t(`${k}.roiMain`)}
      roiMainDesc={t(`${k}.roiMainDesc`)}
      roi1={t(`${k}.roi1`)}
      roi1Desc={t(`${k}.roi1Desc`)}
      roi2={t(`${k}.roi2`)}
      roi2Desc={t(`${k}.roi2Desc`)}
      features={[
        { icon: <IconLayers />, title: t(`${k}.feature1Title`), desc: t(`${k}.feature1Desc`) },
        { icon: <IconPalette />, title: t(`${k}.feature2Title`), desc: t(`${k}.feature2Desc`) },
        { icon: <IconReport />, title: t(`${k}.feature3Title`), desc: t(`${k}.feature3Desc`) },
      ]}
      steps={[
        { title: t(`${k}.step1Title`), desc: t(`${k}.step1Desc`) },
        { title: t(`${k}.step2Title`), desc: t(`${k}.step2Desc`) },
        { title: t(`${k}.step3Title`), desc: t(`${k}.step3Desc`) },
      ]}
    />
  );
}
