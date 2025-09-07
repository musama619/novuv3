import { UiSchemaGroupEnum } from '@novu/shared';
import { Separator } from '@/components/primitives/separator';
import { SidebarContent } from '@/components/side-navigation/sidebar';
import { getComponentByType } from '@/components/workflow-editor/steps/component-utils';
import { useWorkflow } from '@/components/workflow-editor/workflow-provider';

const windowKey = 'window';
const unitKey = 'unit';
const thresholdKey = 'threshold';
const throttleKeyKey = 'throttleKey';

export const ThrottleControlValues = () => {
  const { workflow, step } = useWorkflow();
  const { uiSchema } = step?.controls ?? {};

  if (!uiSchema || !workflow || uiSchema?.group !== UiSchemaGroupEnum.THROTTLE) {
    return null;
  }

  const {
    [windowKey]: window,
    [unitKey]: unit,
    [thresholdKey]: threshold,
    [throttleKeyKey]: throttleKey,
  } = uiSchema.properties ?? {};

  return (
    <>
      {window && unit && (
        <>
          <SidebarContent>{getComponentByType({ component: window.component })}</SidebarContent>
          <Separator />
        </>
      )}
      {threshold && (
        <>
          <SidebarContent>{getComponentByType({ component: threshold.component })}</SidebarContent>
          <Separator />
        </>
      )}
      {throttleKey && (
        <>
          <SidebarContent>{getComponentByType({ component: throttleKey.component })}</SidebarContent>
          <Separator />
        </>
      )}
    </>
  );
};
