import type { ClientModule } from 'claude-code'

/** A terminal header button's chip colors: its ground, under the pointer, and when its toggle is on. */
export type ChipLook = { bg: string; hover: string; fg: string; onBg: string; onFg: string }
export type ButtonProps = { id: string; label: string; dim: boolean; off?: string; on?: boolean; chip?: ChipLook }

// The terminal's header chip: the glyph with a cell of ground either side, filled when its toggle is
// on, a little lighter under the pointer, as the app draws its small buttons.
export const chipText = (label: string): string => ` ${label} `

// A header button that also tells the hooks module when the pointer is over it, which a Button
// alone doesn't, so the header can say what the button does.
const HeaderButton: ClientModule<ButtonProps, { over: boolean }> = (props, surface) => {
  const { Button } = surface.elements
  surface.onPointer(e => {
    const over = e.type !== 'leave'
    if (over === Boolean(surface.state?.over)) return
    surface.setState({ over })
    surface.post({ over })
  })
  // A button with nothing to do here (↑ at the top of Claude's project) is drawn greyed, in `off`'s
  // color, still answering the pointer so the header can say why.
  const { Text } = surface.elements
  const c = props.chip
  if (props.off)
    return c ? (
      <Text color={c.fg} dimColor backgroundColor={c.bg}>
        {chipText(props.label)}
      </Text>
    ) : (
      <Text color={props.off}>{props.label}</Text>
    )
  if (!c) return <Button key={props.id} plain dimColor={props.dim} label={props.label} onPress={() => surface.post({ press: true })} />
  const over = Boolean(surface.state?.over)
  return (
    <Button key={props.id} plain label={props.label} onPress={() => surface.post({ press: true })}>
      <Text color={props.on ? c.onFg : c.fg} backgroundColor={props.on ? c.onBg : over ? c.hover : c.bg} bold={props.on}>
        {chipText(props.label)}
      </Text>
    </Button>
  )
}

export default HeaderButton
