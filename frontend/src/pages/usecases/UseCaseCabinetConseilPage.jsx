import { useTranslation } from 'react-i18next';
import UseCasePageTemplate from '../../components/UseCasePageTemplate';
import { IconConseil, IconLock, IconEye, IconBell } from './icons';

export default function UseCaseCabinetConseilPage() {
  const { t } = useTranslation();
  const k = 'useCases.conseil';

  return (
    <UseCasePageTemplate
      slug="cabinet-conseil"
      personaLabel={t('useCases.nav.conseil')}
      icon={<IconConseil hero />}
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
        { icon: <IconLock />, title: t(`${k}.feature1Title`), desc: t(`${k}.feature1Desc`) },
        { icon: <IconEye />, title: t(`${k}.feature2Title`), desc: t(`${k}.feature2Desc`) },
        { icon: <IconBell />, title: t(`${k}.feature3Title`), desc: t(`${k}.feature3Desc`) },
      ]}
      steps={[
        { title: t(`${k}.step1Title`), desc: t(`${k}.step1Desc`) },
        { title: t(`${k}.step2Title`), desc: t(`${k}.step2Desc`) },
        { title: t(`${k}.step3Title`), desc: t(`${k}.step3Desc`) },
      ]}
    />
  );
}
