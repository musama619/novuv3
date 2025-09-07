import { UiSchemaGroupEnum } from '@novu/shared';
import { Separator } from '@/components/primitives/separator';
import { SidebarContent } from '@/components/side-navigation/sidebar';
import { getComponentByType } from '@/components/workflow-editor/steps/component-utils';
import { useWorkflow } from '@/components/workflow-editor/workflow-provider';

export const ThrottleEditor = () => {
  const { step } = useWorkflow();
  const { uiSchema } = step?.controls ?? {};

  if (!uiSchema || uiSchema?.group !== UiSchemaGroupEnum.THROTTLE) {
    return null;
  }

  const {
    ['window']: window,
    ['unit']: unit,
    ['threshold']: threshold,
    ['throttleKey']: throttleKey,
  } = uiSchema.properties ?? {};

  return (
    <div className="flex flex-col">
      {((window && unit) || threshold) && (
        <>
          <SidebarContent size="lg">
            {getComponentByType({
              component: window?.component || unit?.component || threshold?.component,
            })}
          </SidebarContent>
          <Separator />
        </>
      )}
      {throttleKey && (
        <>
          <SidebarContent size="lg">
            {getComponentByType({
              component: throttleKey.component,
            })}
          </SidebarContent>
          <Separator />
        </>
      )}
    </div>
  );
};
