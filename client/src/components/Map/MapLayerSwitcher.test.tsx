// FE-COMP-MAPLAYER-001 to FE-COMP-MAPLAYER-014
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../../tests/helpers/render'
import { MapLayerSwitcher, TourMapLayerSwitcher, MAP_ROUND_CONTROL_SIZE } from './MapLayerSwitcher'
import type { FerrataMapLayer } from '../Ferratas/useFerrataMapLayer'

describe('MapLayerSwitcher', () => {
  it('FE-COMP-MAPLAYER-001: on the default layer, offers the switch to satellite', () => {
    render(<MapLayerSwitcher active="default" onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: 'Switch to satellite view' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('FE-COMP-MAPLAYER-002: on the satellite layer, offers the switch back to the map', () => {
    render(<MapLayerSwitcher active="satellite" onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: 'Switch to map view' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('FE-COMP-MAPLAYER-003: clicking fires the toggle', () => {
    const onToggle = vi.fn()
    render(<MapLayerSwitcher active="default" onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to satellite view' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('FE-COMP-MAPLAYER-004: swaps the icon with the active layer', () => {
    const { rerender } = render(<MapLayerSwitcher active="default" onToggle={() => {}} />)
    // Destination icon: on the map you can reach satellite, and vice-versa.
    const iconOnDefault = screen.getByRole('button').querySelector('svg')?.getAttribute('class')
    rerender(<MapLayerSwitcher active="satellite" onToggle={() => {}} />)
    const iconOnSatellite = screen.getByRole('button').querySelector('svg')?.getAttribute('class')
    expect(iconOnDefault).not.toBe(iconOnSatellite)
  })

  it('FE-COMP-MAPLAYER-005: highlights the button on hover and clears it again', () => {
    render(<MapLayerSwitcher active="default" onToggle={() => {}} />)
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button)
    expect(button.style.background).toBe('var(--bg-hover)')
    fireEvent.mouseLeave(button)
    expect(button.style.background).toBe('transparent')
  })

  it('FE-COMP-MAPLAYER-006: offers all three Tours-only base layers', () => {
    render(<TourMapLayerSwitcher active="default" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Topo' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Satellite' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('FE-COMP-MAPLAYER-007: reports a per-view Topo selection', () => {
    const onChange = vi.fn()
    render(<TourMapLayerSwitcher active="default" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Topo' }))
    expect(onChange).toHaveBeenCalledWith('topo')
  })

  it('FE-COMP-MAPLAYER-008: the shell is as wide as the size its neighbours are placed off', () => {
    render(<MapLayerSwitcher active="default" onToggle={() => {}} />)
    const button = screen.getByRole('button')
    const shell = button.parentElement as HTMLElement

    // The phone's compass stands beside the switcher at inset + size + gap. If the
    // markup grew without the constant, the compass would slide back under the shell.
    expect(shell.style.padding).toBe('4px')
    expect(button.style.width).toBe('34px')
    expect(button.style.height).toBe('34px')
    expect(parseFloat(button.style.width) + 2 * parseFloat(shell.style.padding)).toBe(MAP_ROUND_CONTROL_SIZE)
  })
})

describe('TourMapLayerSwitcher 3D switch', () => {
  it('FE-COMP-MAPLAYER-009: offers no 3D switch on a map that has no terrain mode', () => {
    render(<TourMapLayerSwitcher active="default" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: '3D' })).toBeNull()
  })

  it('FE-COMP-MAPLAYER-010: toggles the terrain mode and shows whether it is on', () => {
    const onToggleTerrain = vi.fn()
    const { rerender } = render(<TourMapLayerSwitcher active="topo" onChange={() => {}} onToggleTerrain={onToggleTerrain} />)
    const off = screen.getByRole('button', { name: '3D' })
    expect(off).toHaveAttribute('aria-pressed', 'false')
    expect(off).toHaveClass('text-content-muted')
    expect(off.style.background).toBe('transparent')
    fireEvent.click(off)
    expect(onToggleTerrain).toHaveBeenCalledTimes(1)

    rerender(<TourMapLayerSwitcher active="topo" onChange={() => {}} onToggleTerrain={onToggleTerrain} terrainActive />)
    const on = screen.getByRole('button', { name: '3D' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    expect(on).toHaveClass('bg-accent', 'text-accent-text')
    expect(on.style.background).toBe('')
    // The base layer stays selectable beside it.
    expect(screen.getByRole('button', { name: 'Topo' })).toHaveAttribute('aria-pressed', 'true')
  })
})

const ferrataLayer = (overrides: Partial<FerrataMapLayer> = {}): FerrataMapLayer => ({
  active: false,
  onToggle: vi.fn(),
  status: 'idle',
  ferratas: [],
  onSelect: vi.fn(),
  ...overrides,
})

describe('TourMapLayerSwitcher via ferrata switch', () => {
  it('FE-COMP-MAPLAYER-011: offers no via ferrata switch without a layer, and no status row either', () => {
    const { container } = render(<TourMapLayerSwitcher active="default" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Via ferratas' })).toBeNull()
    expect(container.firstElementChild).toHaveAttribute('role', 'group')
  })

  it('FE-COMP-MAPLAYER-012: the switch toggles the layer, pressed and in the accent while it is on', () => {
    const layer = ferrataLayer()
    const { rerender } = render(<TourMapLayerSwitcher active="topo" onChange={() => {}} ferrataLayer={layer} />)
    const off = screen.getByRole('button', { name: 'Via ferratas' })
    expect(off).toHaveAttribute('aria-pressed', 'false')
    expect(off).toHaveClass('text-content-muted')
    fireEvent.click(off)
    expect(layer.onToggle).toHaveBeenCalledTimes(1)

    rerender(<TourMapLayerSwitcher active="topo" onChange={() => {}} ferrataLayer={ferrataLayer({ active: true, status: 'loading' })} />)
    const on = screen.getByRole('button', { name: 'Via ferratas' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    expect(on).toHaveClass('bg-accent', 'text-accent-text')
  })

  it('FE-COMP-MAPLAYER-013: the status pill sits in the same row, right of the pill, and says nothing while the layer is off', () => {
    const { rerender } = render(<TourMapLayerSwitcher active="default" onChange={() => {}} ferrataLayer={ferrataLayer()} />)
    expect(screen.queryByTestId('ferrata-status-pill')).toBeNull()

    rerender(<TourMapLayerSwitcher active="default" onChange={() => {}} ferrataLayer={ferrataLayer({ active: true, status: 'tooLarge' })} />)
    const pill = screen.getByTestId('ferrata-status-pill')
    expect(pill).toHaveTextContent('Zoom in to load via ferratas')
    const row = pill.parentElement as HTMLElement
    expect(row.style.display).toBe('flex')
    expect(row.firstElementChild).toHaveAttribute('role', 'group')
    expect(row.lastElementChild).toBe(pill)
  })

  it('FE-COMP-MAPLAYER-014: sits beside the 3D switch behind one divider, and counts what the layer found', () => {
    const found = [{ id: 'way/1' }, { id: 'way/2' }] as unknown as FerrataMapLayer['ferratas']
    render(
      <TourMapLayerSwitcher active="default" onChange={() => {}} onToggleTerrain={() => {}}
        ferrataLayer={ferrataLayer({ active: true, status: 'ready', ferratas: found })} />
    )
    const group = screen.getByRole('group')
    expect(group.querySelectorAll('span[aria-hidden]')).toHaveLength(1)
    const buttons = Array.from(group.querySelectorAll('button')).map((button) => button.textContent)
    expect(buttons.slice(-2)).toEqual(['Via ferratas', '3D'])
    expect(screen.getByTestId('ferrata-status-pill')).toHaveTextContent('2 via ferrata routes')
  })
})
