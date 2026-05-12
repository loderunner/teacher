'use client';

import { useState } from 'react';

import { setJourneyStyleAction } from './set-journey-style';

import { StylePicker } from '@/components/style-picker';
import type { Style } from '@/lib/server/styles/get';

type Props = {
  presets: Style[];
  initialStyleId: string;
  journeyId: string;
};

export function StylePickerPersist({
  presets,
  initialStyleId,
  journeyId,
}: Props) {
  const [styleId, setStyleId] = useState(initialStyleId);

  async function handleChange(id: string) {
    setStyleId(id);
    await setJourneyStyleAction({ journeyId, styleId: id });
  }

  return (
    <StylePicker presets={presets} value={styleId} onChange={handleChange} />
  );
}
