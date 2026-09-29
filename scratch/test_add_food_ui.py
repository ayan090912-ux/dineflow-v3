import urllib.request, json, asyncio, websockets, sys

async def test_add_food_flow():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        # First ensure we are on Food Menu
        js_prep = """
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const foodTab = btns.find(b => b.innerText.includes('Food Menu'));
            if (foodTab) foodTab.click();
            return 'Switched to Food Menu';
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js_prep, 'returnByValue': True}}))
        print("Prep:", (await ws.recv()))
        await asyncio.sleep(1)

        # Click "Add Food Item"
        js_click_add = """
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const addBtn = btns.find(b => b.innerText.includes('Add Food Item') || b.innerText.includes('Add New Item'));
            if (addBtn) {
                addBtn.click();
                return 'Clicked Add Food Item button';
            }
            return 'Add button not found';
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js_click_add, 'returnByValue': True}}))
        resp2 = json.loads(await ws.recv())
        print("Click Add:", resp2.get('result', {}).get('result', {}).get('value'))
        await asyncio.sleep(1)

        # Fill inputs and click Save
        js_fill_and_save = """
        (() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const nameInput = inputs.find(i => i.placeholder && i.placeholder.includes('Artisanal Burrata'));
            const priceInput = inputs.find(i => i.type === 'number' || (i.placeholder && i.placeholder.includes('250.00')));
            
            if (!nameInput || !priceInput) {
                return 'Inputs not found: nameInput=' + !!nameInput + ', priceInput=' + !!priceInput;
            }

            // Set values using native value setter for React
            const setNativeValue = (element, value) => {
                const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value').set;
                valueSetter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            };

            setNativeValue(nameInput, 'Crispy Truffle Fries');
            setNativeValue(priceInput, '280');

            const modalBtns = Array.from(document.querySelectorAll('button'));
            const saveBtn = modalBtns.find(b => b.innerText.includes('Save to Restaurant Menu'));
            if (!saveBtn) return 'Save button not found';
            saveBtn.click();
            return 'Filled form and clicked Save';
        })()
        """
        await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': js_fill_and_save, 'returnByValue': True}}))
        resp3 = json.loads(await ws.recv())
        print("Fill & Save:", resp3.get('result', {}).get('result', {}).get('value'))
        await asyncio.sleep(3)

        # Check page text now
        await ws.send(json.dumps({'id': 4, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.body.innerText', 'returnByValue': True}}))
        resp4 = json.loads(await ws.recv())
        text = resp4.get('result', {}).get('result', {}).get('value', '')
        print("\n--- PAGE TEXT AFTER ADD ---")
        sys.stdout.buffer.write(text.encode('utf-8'))
        print("\n---------------------------")

asyncio.run(test_add_food_flow())
