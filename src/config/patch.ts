export interface PatchChannelSpec {
  channel: number;
  capacity: number;
  location: string;
}

export interface PatchChannelRow {
  id: string;
  label: string;
  channels: PatchChannelSpec[];
}

const range = (start: number, end: number, capacity: number, location: string): PatchChannelSpec[] => {
  const channels: PatchChannelSpec[] = [];
  for (let channel = start; channel <= end; channel += 1) {
    channels.push({ channel, capacity, location });
  }
  return channels;
};

export const HUMANITIES_PATCH_ROWS: PatchChannelRow[] = [
  { id: 'catwalk-1-upstage', label: '1번 캣워크 Upstage 면', channels: range(1, 3, 8, '1번 캣워크 Upstage 면') },
  { id: 'catwalk-1-downstage', label: '1번 캣워크 Downstage 면', channels: range(4, 13, 2, '1번 캣워크 Downstage 면') },
  { id: 'catwalk-2-upstage', label: '2번 캣워크 Upstage 면', channels: range(14, 23, 2, '2번 캣워크 Upstage 면') },
  { id: 'catwalk-2-downstage', label: '2번 캣워크 Downstage 면', channels: range(24, 33, 2, '2번 캣워크 Downstage 면') },
  { id: 'catwalk-3-upstage', label: '3번 캣워크 Upstage 면', channels: range(34, 43, 2, '3번 캣워크 Upstage 면') },
  { id: 'catwalk-3-downstage', label: '3번 캣워크 Downstage 면', channels: range(44, 53, 2, '3번 캣워크 Downstage 면') },
  { id: 'catwalk-4-upstage', label: '4번 캣워크 Upstage 면', channels: range(54, 63, 2, '4번 캣워크 Upstage 면') },
  { id: 'catwalk-5-upstage', label: '5번 캣워크 Upstage 면', channels: range(64, 71, 2, '5번 캣워크 Upstage 면') },
  { id: 'catwalk-6-upstage', label: '6번 캣워크 Upstage 면', channels: range(72, 79, 2, '6번 캣워크 Upstage 면') },
  { id: 'stage-floor', label: '무대 1층', channels: range(80, 91, 1, '무대 1층') }
];

export const HUMANITIES_PATCH_CHANNELS = HUMANITIES_PATCH_ROWS
  .flatMap(row => row.channels)
  .reduce<Record<number, PatchChannelSpec>>((acc, spec) => {
    acc[spec.channel] = spec;
    return acc;
  }, {});
