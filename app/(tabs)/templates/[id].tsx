import { useLocalSearchParams } from 'expo-router';
import { TemplateEditor } from '@/screens/templates/template-editor';

export default function TemplateEditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TemplateEditor templateId={id} />;
}
