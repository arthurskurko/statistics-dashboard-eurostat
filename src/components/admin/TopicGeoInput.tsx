import React from 'react';
import GeoTagInput from './GeoTagInput';
import { OPEN_METEO_TOPIC_MAP } from '../../features/dashboard/openMeteoTopicCatalog';
import { WHO_TOPIC_MAP } from '../../features/dashboard/whoTopicCatalog';
import { WORLD_BANK_TOPIC_MAP } from '../../features/dashboard/worldBankTopicCatalog';
import { OPEN_METEO_GEOS } from '../../lib/openMeteo';
import { fetchWhoCountries, fetchWhoTopicData } from '../../lib/who';
import { fetchWorldBankCountries, fetchWorldBankTopicData } from '../../lib/worldBank';
import type { TopicDefinition } from '../../features/dashboard/types';

type Props = {
  topic: TopicDefinition;
  value: string[];
  onChange: (values: string[]) => void;
  topicMap: Record<string, TopicDefinition>;
};

export default function TopicGeoInput({ topic, value, onChange, topicMap }: Props) {
  const [suggestions, setSuggestions] = React.useState<Array<{ code: string; label: string }> | undefined>(undefined);
  const [suggestionSource, setSuggestionSource] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // eslint-disable-next-line no-console
        console.log('Admin.TopicGeoInput loading suggestions for', { id: topic.id, datasetCode: (topic as any).datasetCode });
      } catch {
        // ignore
      }

      const isOpenMeteo = Boolean(OPEN_METEO_TOPIC_MAP[topic.id]) ||
        Object.values(OPEN_METEO_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === OPEN_METEO_TOPIC_MAP;

      if (isOpenMeteo) {
        // eslint-disable-next-line no-console
        console.log('Admin.TopicGeoInput detected OpenMeteo for', topic.id);
        setSuggestionSource('openmeteo');
        setSuggestions(OPEN_METEO_GEOS.map((g: any) => ({ code: g.code, label: g.label })));
        return;
      }

      const isWho = Boolean(WHO_TOPIC_MAP[topic.id]) ||
        Object.values(WHO_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === WHO_TOPIC_MAP;

      if (isWho) {
        try {
          // eslint-disable-next-line no-console
          console.log('Admin.TopicGeoInput detected WHO for', topic.id);
          setSuggestionSource('who');
          const topicData = await fetchWhoTopicData(topic.id as string).catch(() => null);
          if (!mounted) return;
          if (topicData?.availableGeos && topicData.availableGeos.length > 0) {
            setSuggestions(topicData.availableGeos);
            return;
          }

          const countries = await fetchWhoCountries();
          if (!mounted) return;
          setSuggestions(countries);
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Admin.TopicGeoInput WHO fetch failed', err);
        }
      }

      const isWorldBank = Boolean(WORLD_BANK_TOPIC_MAP[topic.id]) ||
        Object.values(WORLD_BANK_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === WORLD_BANK_TOPIC_MAP;

      if (isWorldBank) {
        try {
          // eslint-disable-next-line no-console
          console.log('Admin.TopicGeoInput detected WorldBank for', topic.id);
          setSuggestionSource('worldbank');
          const topicData = await fetchWorldBankTopicData(topic.id as string).catch(() => null);
          if (!mounted) return;
          if (topicData?.availableGeos && topicData.availableGeos.length > 0) {
            setSuggestions(topicData.availableGeos);
            return;
          }

          const countries = await fetchWorldBankCountries();
          if (!mounted) return;
          setSuggestions(countries);
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Admin.TopicGeoInput WorldBank fetch failed', err);
        }
      }

      setSuggestionSource('known');
      setSuggestions(undefined);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [topic.id, topic.datasetCode, topicMap]);

  return (
    <>
      <GeoTagInput
        values={value}
        onChange={onChange}
        suggestions={suggestions}
        placeholder="Add geo (e.g. EE)"
      />
      <div className="mt-1 text-xs text-slate-400">Suggestions source: {suggestionSource ?? 'unknown'}</div>
    </>
  );
}
