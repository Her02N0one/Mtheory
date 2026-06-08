import re
path = r'C:\Users\ayd3n\Projects\Mtheory\templates\stage.html'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

# Replace lines 83-110 (0-indexed: 82-109) with new block
# Line 82 is the fretboard box-drawing comment, 83-85 fretboard div,
# 86 blank, 87 theory panel comment, 88 blank, 89-110 theory-panel div
FIRST = 82   # 0-indexed, the fretboard comment line
LAST  = 110  # 0-indexed, closing </div> of theory-panel (inclusive)

new_block = '''\
  <!-- Fretboard + CoF sidebar -->
  <div class="fret-section no-print">
    <div class="fret-sidebar">
      <div class="theory-circles-wrap">
        <div class="theory-circle-wrap" id="cof-wrap">
          <svg id="chrom-circle" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Circle of Fifths</div>
        </div>
        <div class="theory-circle-wrap" id="clock-wrap" style="display:none">
          <svg id="chrom-clock" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Chromatic Clock</div>
        </div>
      </div>
    </div>
    <div class="fret-main">
      <div class="fretboard-container" id="fretboard-container">
        {{ svg | safe }}
      </div>
      <div class="theory-panel" id="theory-panel">
        <div class="theory-left">
          <div class="theory-info">
            <div class="theory-degree" id="theory-degree"></div>
            <div class="theory-motion" id="theory-motion"></div>
            <div class="theory-desc" id="theory-desc"></div>
          </div>
        </div>
        <div class="theory-right">
          <div class="theory-arp" id="theory-arp"></div>
        </div>
      </div>
    </div>
  </div>
'''

lines[FIRST:LAST+1] = [new_block]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Done. Lines replaced.")
print(f"New line count: {len(lines)}")


old = '''  <!-- Theory panel -->
  <div class="theory-panel no-print" id="theory-panel">
    <div class="theory-left">
      <div class="theory-circles-wrap">
        <div class="theory-circle-wrap" id="cof-wrap">
          <svg id="chrom-circle" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Circle of Fifths</div>
        </div>
        <div class="theory-circle-wrap" id="clock-wrap" style="display:none">
          <svg id="chrom-clock" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Chromatic Clock</div>
        </div>
      </div>
      <div class="theory-info">
        <div class="theory-degree" id="theory-degree"></div>
        <div class="theory-motion" id="theory-motion"></div>
        <div class="theory-desc" id="theory-desc"></div>
      </div>
    </div>
    <div class="theory-right">
      <div class="theory-arp" id="theory-arp"></div>
    </div>
  </div>'''

new = '''  <!-- Fretboard + theory flanked by CoF sidebar -->
  <div class="fret-section no-print">
    <div class="fret-sidebar">
      <div class="theory-circles-wrap">
        <div class="theory-circle-wrap" id="cof-wrap">
          <svg id="chrom-circle" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Circle of Fifths</div>
        </div>
        <div class="theory-circle-wrap" id="clock-wrap" style="display:none">
          <svg id="chrom-clock" class="chrom-circle" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="chrom-circle-label">Chromatic Clock</div>
        </div>
      </div>
    </div>
    <div class="fret-main">
      <div class="fretboard-container" id="fretboard-container-inner">
      </div>
      <div class="theory-panel" id="theory-panel">
        <div class="theory-left">
          <div class="theory-info">
            <div class="theory-degree" id="theory-degree"></div>
            <div class="theory-motion" id="theory-motion"></div>
            <div class="theory-desc" id="theory-desc"></div>
          </div>
        </div>
        <div class="theory-right">
          <div class="theory-arp" id="theory-arp"></div>
        </div>
      </div>
    </div>
  </div>'''

if old in content:
    # Also remove the old standalone fretboard-container since we're moving it inside fret-main
    old_fret = '''  <div class="fretboard-container" id="fretboard-container">
    {{ svg | safe }}
  </div>

  <!-- Theory panel -->'''
    new_fret = '''  <!-- fret-section below -->'''
    content = content.replace(old_fret, new_fret)
    # Now do the theory panel replacement, injecting the svg into the inner container
    new_with_svg = new.replace(
        '      <div class="fretboard-container" id="fretboard-container-inner">\n      </div>',
        '      <div class="fretboard-container" id="fretboard-container">\n        {{ svg | safe }}\n      </div>'
    )
    content = content.replace('  <!-- fret-section below -->', new_with_svg.replace(old, '').strip())
    # Actually let's just do it cleanly
    print("ERROR: approach too complex, trying direct")
else:
    print("OLD NOT FOUND")
    print(repr(content[content.find('theory-panel'):content.find('theory-panel')+50]))
