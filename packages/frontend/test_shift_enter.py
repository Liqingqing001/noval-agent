#!/usr/bin/env python3
# Test Shift+Enter functionality in AgentPanel

from browser_harness import ensure_real_tab, goto, wait, screenshot, click, type_text, press_key, get_element, eval_js

# Open the app
ensure_real_tab()
goto("http://localhost:5173")
wait(2000)
screenshot("step1-initial.png")
print("Step 1: Initial page loaded")

# Wait for the app to render
wait(3000)

# Try to find and click on a novel in the sidebar to select it
# First let's see what's on the page
page_text = eval_js("document.body.innerText")
print(f"Page content preview: {page_text[:500]}")

# Look for a novel item to click
novel_items = eval_js("""
(() => {
  const items = document.querySelectorAll('[class*="novel"], [class*="sidebar"] li, [class*="item"]');
  return items.length > 0 ? items[0].className : 'none found';
})()
""")
print(f"Novel items found: {novel_items}")

# Try clicking on the first novel in the sidebar
click('[class*="sidebar"] li, [data-novel-id], .novel-item')
wait(1000)
screenshot("step2-novel-selected.png")
print("Step 2: Tried to select a novel")

# Find the textarea input for AI chat
textarea_info = eval_js("""
(() => {
  const textarea = document.querySelector('textarea');
  if (textarea) {
    return {
      found: true,
      placeholder: textarea.placeholder,
      className: textarea.className,
      disabled: textarea.disabled
    };
  }
  return { found: false };
})()
""")
print(f"Textarea info: {textarea_info}")

if textarea_info.get('found'):
    # Focus the textarea
    eval_js("document.querySelector('textarea').focus()")
    wait(500)

    # Type some text
    type_text("这是第一行文字")
    wait(500)
    screenshot("step3-first-line.png")
    print("Step 3: Typed first line")

    # Press Shift+Enter to add newline
    press_key("Enter", shift=True)
    wait(500)

    # Type second line
    type_text("这是第二行文字")
    wait(500)
    screenshot("step4-second-line.png")
    print("Step 4: Typed second line after Shift+Enter")

    # Check if textarea has newline
    textarea_value = eval_js("document.querySelector('textarea').value")
    print(f"Textarea value: {textarea_value}")
    print(f"Has newline: {'\\n' in textarea_value}")

    # Check textarea height
    textarea_height = eval_js("document.querySelector('textarea').style.height")
    print(f"Textarea height: {textarea_height}")

    # Press Enter to send (without Shift)
    press_key("Enter")
    wait(2000)
    screenshot("step5-after-send.png")
    print("Step 5: Pressed Enter to send")

    # Final result
    result = {
        "textarea_found": True,
        "value_before_send": textarea_value,
        "has_newline": '\n' in textarea_value,
        "height": textarea_height
    }
    print(f"\n=== VERIFICATION RESULT ===")
    print(f"Shift+Enter created newline: {result['has_newline']}")
else:
    print("ERROR: Textarea not found!")
    screenshot("error-no-textarea.png")

print("\nTest completed!")