'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type DateRange,
  getMonthRange,
  getQuarterRange,
} from '@/lib/report-utils';
import { subMonths, subQuarters } from 'date-fns';

type PeriodPreset = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'custom';

type ReportPeriodSelectorProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

export default function ReportPeriodSelector({ value, onChange }: ReportPeriodSelectorProps) {
  const [preset, setPreset] = useState<PeriodPreset>('this-month');

  function handlePresetChange(newPreset: PeriodPreset) {
    setPreset(newPreset);
    const now = new Date();

    switch (newPreset) {
      case 'this-month':
        onChange(getMonthRange(now));
        break;
      case 'last-month':
        onChange(getMonthRange(subMonths(now, 1)));
        break;
      case 'this-quarter':
        onChange(getQuarterRange(now));
        break;
      case 'last-quarter':
        onChange(getQuarterRange(subQuarters(now, 1)));
        break;
      case 'custom':
        // Keep current range, user will pick dates
        break;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as PeriodPreset)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="this-month">This Month</SelectItem>
          <SelectItem value="last-month">Last Month</SelectItem>
          <SelectItem value="this-quarter">This Quarter</SelectItem>
          <SelectItem value="last-quarter">Last Quarter</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[140px] justify-start text-left font-normal',
                  !value.from && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(value.from, 'dd MMM yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.from}
                onSelect={(date) => date && onChange({ ...value, from: date })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[140px] justify-start text-left font-normal',
                  !value.to && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(value.to, 'dd MMM yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.to}
                onSelect={(date) => date && onChange({ ...value, to: date })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
