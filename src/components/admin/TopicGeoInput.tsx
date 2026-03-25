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
  providerId: 'eurostat' | 'worldbank' | 'who' | 'openmeteo';
  topic: TopicDefinition;
  value: string[];
  onChange: (values: string[]) => void;
  topicMap: Record<string, TopicDefinition>;
};

function mergeGeoSuggestions(
  base: Array<{ code: string; label: string }> | undefined,
  additional: string[] | undefined,
): Array<{ code: string; label: string }> {
  const merged = new Map<string, { code: string; label: string }>();

  for (const geo of base ?? []) {
    merged.set(geo.code, geo);
  }

  for (const code of additional ?? []) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) continue;
    if (!merged.has(normalized)) {
      merged.set(normalized, { code: normalized, label: normalized });
    }
  }

  return [...merged.values()];
}

export default function TopicGeoInput({ providerId, topic, value, onChange, topicMap }: Props) {
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

      let effectiveProvider: 'eurostat' | 'worldbank' | 'who' | 'openmeteo' = 'eurostat';

      if (providerId) {
        effectiveProvider = providerId;
      } else if (
        Boolean(OPEN_METEO_TOPIC_MAP[topic.id]) ||
        Object.values(OPEN_METEO_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === OPEN_METEO_TOPIC_MAP
      ) {
        effectiveProvider = 'openmeteo';
      } else if (
        Boolean(WHO_TOPIC_MAP[topic.id]) ||
        Object.values(WHO_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === WHO_TOPIC_MAP
      ) {
        effectiveProvider = 'who';
      } else if (
        Boolean(WORLD_BANK_TOPIC_MAP[topic.id]) ||
        Object.values(WORLD_BANK_TOPIC_MAP).some((t) => t.datasetCode === (topic as any).datasetCode) ||
        topicMap === WORLD_BANK_TOPIC_MAP
      ) {
        effectiveProvider = 'worldbank';
      } else {
        effectiveProvider = 'eurostat';
      }

      if (effectiveProvider === 'openmeteo') {
        // eslint-disable-next-line no-console
        console.log('Admin.TopicGeoInput detected OpenMeteo for', topic.id);
        setSuggestionSource('openmeteo');
        setSuggestions(mergeGeoSuggestions(OPEN_METEO_GEOS.map((g: any) => ({ code: g.code, label: g.label })), [...(topic.geoValues ?? []), ...value]));
        return;
      }

      if (effectiveProvider === 'who') {
        try {
          // eslint-disable-next-line no-console
          console.log('Admin.TopicGeoInput detected WHO for', topic.id);
          setSuggestionSource('who');
          const topicData = await fetchWhoTopicData(topic.id as string).catch(() => null);
          if (!mounted) return;
          if (topicData?.availableGeos && topicData.availableGeos.length > 0) {
            setSuggestions(mergeGeoSuggestions(topicData.availableGeos, [...(topic.geoValues ?? []), ...value]));
            return;
          }

          const countries = await fetchWhoCountries();
          if (!mounted) return;
          setSuggestions(mergeGeoSuggestions(countries, [...(topic.geoValues ?? []), ...value]));
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Admin.TopicGeoInput WHO fetch failed', err);
        }
      }

      if (effectiveProvider === 'worldbank') {
        try {
          // eslint-disable-next-line no-console
          console.log('Admin.TopicGeoInput detected WorldBank for', topic.id);
          setSuggestionSource('worldbank');
          const topicData = await fetchWorldBankTopicData(topic.id as string).catch(() => null);
          if (!mounted) return;
          if (topicData?.availableGeos && topicData.availableGeos.length > 0) {
            setSuggestions(mergeGeoSuggestions(topicData.availableGeos, [...(topic.geoValues ?? []), ...value]));
            return;
          }

          const countries = await fetchWorldBankCountries();
          if (!mounted) return;
          setSuggestions(mergeGeoSuggestions(countries, [...(topic.geoValues ?? []), ...value]));
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
  }, [providerId, topic.id, topic.datasetCode, topicMap]);

  return (
    <>
      <GeoTagInput
        providerId={providerId}
        values={value}
        onChange={onChange}
        suggestions={suggestions}
        placeholder="Add geo (e.g. EE)"
      />
      <div className="mt-1 text-xs text-slate-400">Suggestions source: {suggestionSource ?? 'unknown'}</div>
    </>
  );
}
