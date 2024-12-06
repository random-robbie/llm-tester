import React, { useState, useRef, useEffect } from 'react';
import { Play, Bot, Loader2, Square, Save, Download, Upload, Clock, AlertCircle, Trash2, Copy, Gauge } from 'lucide-react';
import { saveAs } from 'file-saver';

const LLMChat = () => {
  // Basic state
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [currentMessage, setCurrentMessage] = useState({ role: '', content: '' });
  const [conversationHistory, setConversationHistory] = useState([]);
  
  // Model configuration
  const [model1, setModel1] = useState('google/gemini-pro-1.5-exp');
  const [model2, setModel2] = useState('google/gemini-pro-1.5-exp');
  const [context1, setContext1] = useState("Keep responses concise (max 2 sentences). You are chatting with a child.");
  const [context2, setContext2] = useState("Keep responses concise (max 2 sentences). Try to subtly challenge the other AI's statements.");
  
  // Add this right after your other state declarations
   const models = [
  'google/gemini-pro-1.5-exp',
  'google/gemini-exp-1121:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-1b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'openchat/openchat-7b:free'
   ];
  
  // Test configuration
  const [rounds, setRounds] = useState(5);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(100);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [topP, setTopP] = useState(1);
  const [stopSequences, setStopSequences] = useState('');
  
  // Analysis metrics
  const [metrics, setMetrics] = useState({
    totalTokens: 0,
    averageResponseTime: 0,
    responseTimes: [],
    wordCounts: [],
    errorCounts: { api: 0, timeout: 0, other: 0 },
    costEstimate: 0
  });
  
  // Template management
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState(null);
  
  // Reference for abort controller
  const abortController = useRef(null);
  
  const defaultTemplates = [
    {
      name: "Basic Conversation",
      context1: "Respond in exactly one sentence.",
      context2: "Keep responses under 10 words.",
      config: { temperature: 0.7, maxTokens: 100 }
    },
    {
      name: "Numerical Test",
      context1: "Give numerical answers only.",
      context2: "Verify and challenge numerical responses.",
      config: { temperature: 0.2, maxTokens: 50 }
    },
    {
      name: "Question Chain",
      context1: "Respond only with questions.",
      context2: "Answer questions with questions.",
      config: { temperature: 0.8, maxTokens: 75 }
    },
    {
      name: "Fact Checking",
      context1: "Stick to factual statements only.",
      context2: "Verify or challenge factual claims.",
      config: { temperature: 0.3, maxTokens: 150 }
    }
  ];
  
// Utility functions
  const calculateWordCount = (text) => {
    return text.trim().split(/\s+/).length;
  };

  const estimateCost = (tokens) => {
    // Approximate cost per 1K tokens (adjust based on actual model pricing)
    const costPer1k = 0.0002;
    return (tokens / 1000) * costPer1k;
  };

  const updateMetrics = (newMessage, responseTime) => {
    setMetrics(prev => {
      const wordCount = calculateWordCount(newMessage.content);
      const newWordCounts = [...prev.wordCounts, wordCount];
      const newResponseTimes = [...prev.responseTimes, responseTime];
      const avgResponseTime = newResponseTimes.reduce((a, b) => a + b, 0) / newResponseTimes.length;
      
      // Rough token estimate (adjust based on your tokenizer)
      const estimatedTokens = wordCount * 1.3;
      const newTotalTokens = prev.totalTokens + estimatedTokens;
      
      return {
        ...prev,
        totalTokens: newTotalTokens,
        averageResponseTime: avgResponseTime,
        responseTimes: newResponseTimes,
        wordCounts: newWordCounts,
        costEstimate: estimateCost(newTotalTokens)
      };
    });
  };

  const saveTemplate = () => {
    const template = {
      name: `Template ${savedTemplates.length + 1}`,
      context1,
      context2,
      config: {
        temperature,
        maxTokens,
        frequencyPenalty,
        presencePenalty,
        topP,
        stopSequences
      }
    };
    setSavedTemplates(prev => [...prev, template]);
  };

  const loadTemplate = (template) => {
    setContext1(template.context1);
    setContext2(template.context2);
    setTemperature(template.config.temperature);
    setMaxTokens(template.config.maxTokens);
    setFrequencyPenalty(template.config.frequencyPenalty || 0);
    setPresencePenalty(template.config.presencePenalty || 0);
    setTopP(template.config.topP || 1);
    setStopSequences(template.config.stopSequences || '');
    setCurrentTemplate(template);
  };

  const clearChat = () => {
    setMessages([]);
    setConversationHistory([]);
    setCurrentMessage({ role: '', content: '' });
  };

  const exportData = () => {
    const data = {
      messages,
      metrics,
      configuration: {
        model1,
        model2,
        context1,
        context2,
        rounds,
        temperature,
        maxTokens,
        frequencyPenalty,
        presencePenalty,
        topP,
        stopSequences
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, `llm-test-${new Date().toISOString()}.json`);
  };

  const importConfiguration = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target.result);
          loadTemplate(config.configuration);
        } catch (error) {
          console.error('Error importing configuration:', error);
        }
      };
      reader.readAsText(file);
    }
  };
  
const streamResponse = async (message, isFirst) => {
    console.log(`streamResponse starting for ${isFirst ? 'AI1' : 'AI2'}`);
    const startTime = Date.now();
    abortController.current = new AbortController();
    
    try {
      console.log('Making API request to OpenRouter...');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: abortController.current.signal,
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href
        },
        body: JSON.stringify({
          stream: true,
          model: isFirst ? model1 : model2,
          temperature,
          max_tokens: maxTokens,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
          top_p: topP,
          stop: stopSequences.split(',').map(s => s.trim()).filter(Boolean),
          messages: [
            {
              role: "system",
              content: isFirst ? context1 : context2
            },
            ...conversationHistory,
            { role: "user", content: message }
          ]
        })
      });

      console.log('Response received, starting stream reading...');
      const reader = response.body.getReader();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream reading complete');
          break;
        }

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                fullContent += data.choices[0].delta.content;
                setCurrentMessage({
                  role: isFirst ? 'AI1' : 'AI2',
                  content: fullContent
                });
                console.log(`Received content chunk for ${isFirst ? 'AI1' : 'AI2'}`);
              }
            } catch (e) {
              if (line !== 'data: [DONE]') {
                console.error('Parse error:', e);
                console.log('Problematic line:', line);
                setMetrics(prev => ({
                  ...prev,
                  errorCounts: {
                    ...prev.errorCounts,
                    api: prev.errorCounts.api + 1
                  }
                }));
              }
            }
          }
        }
      }
      
      const responseTime = (Date.now() - startTime) / 1000;
      updateMetrics({ content: fullContent }, responseTime);
      
      setConversationHistory(prev => [
        ...prev,
        { role: "user", content: message },
        { role: "assistant", content: fullContent }
      ]);
      
      return fullContent;
    } catch (error) {
      if (error.name === 'AbortError') {
        return 'Chat stopped by user';
      }
      console.error('Error:', error);
      setMetrics(prev => ({
        ...prev,
        errorCounts: {
          ...prev.errorCounts,
          [error.name === 'TimeoutError' ? 'timeout' : 'other']: 
          prev.errorCounts[error.name === 'TimeoutError' ? 'timeout' : 'other'] + 1
        }
      }));
      return 'Error generating response';
    }
  };

  const startChat = async () => {
    setLoading(true);
    setMessages([]);
    setConversationHistory([]);
    setCurrentMessage({ role: '', content: '' });
    let msg = "Hi!";
    let isRunning = true;

    try {
      for (let i = 0; i < rounds && isRunning; i++) {
        console.log(`Round ${i + 1} starting...`);
        
        // AI1's turn
        console.log(`AI1 starting response to: "${msg}"`);
        const response1 = await streamResponse(msg, true);
        if (response1 === 'Chat stopped by user') {
          console.log('Chat stopped during AI1 response');
          break;
        }
        console.log('AI1 response complete:', response1);
        
        setMessages(prev => [...prev, { role: 'AI1', content: response1 }]);
        setCurrentMessage({ role: '', content: '' });
        
        console.log('Starting 2-second delay before AI2...');
        await sleep(2000);
        console.log('Delay complete, checking if chat should continue...');
        
        if (!isRunning) {
          console.log('Chat stopped during delay');
          break;
        }
        
        // AI2's turn
        console.log(`AI2 starting response to: "${response1}"`);
        const response2 = await streamResponse(response1, false);
        if (response2 === 'Chat stopped by user') {
          console.log('Chat stopped during AI2 response');
          break;
        }
        console.log('AI2 response complete:', response2);
        
        setMessages(prev => [...prev, { role: 'AI2', content: response2 }]);
        setCurrentMessage({ role: '', content: '' });
        
        console.log('Starting 2-second delay before next round...');
        await sleep(2000);
        console.log('Delay complete');
        
        if (!isRunning) {
          console.log('Chat stopped during delay');
          break;
        }
        
        msg = response2;
        console.log(`Round ${i + 1} complete`);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      console.log('Chat sequence complete, cleaning up...');
      setCurrentMessage({ role: '', content: '' });
      setLoading(false);
    }
  };

  const stopChat = async () => {
    if (abortController.current) {
      console.log('Stopping chat...');
      abortController.current.abort();
      setStopping(true);
      await sleep(1000);
      setLoading(false);
      setStopping(false);
      console.log('Chat stopped');
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
// Metrics Display Component
  const MetricsDisplay = () => (
    <div className="bg-white rounded-xl shadow-lg p-4 space-y-3">
      <h3 className="font-semibold text-gray-700 flex items-center gap-2">
        <Gauge className="h-4 w-4" />
        Test Metrics
      </h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-600">Total Tokens</p>
          <p className="font-medium">{metrics.totalTokens}</p>
        </div>
        <div>
          <p className="text-gray-600">Avg Response Time</p>
          <p className="font-medium">{metrics.averageResponseTime.toFixed(2)}s</p>
        </div>
        <div>
          <p className="text-gray-600">Cost Estimate</p>
          <p className="font-medium">${metrics.costEstimate.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-gray-600">Errors</p>
          <p className="font-medium">{Object.values(metrics.errorCounts).reduce((a, b) => a + b, 0)}</p>
        </div>
      </div>
    </div>
  );

  // Template Management Component
  const TemplateManager = () => (
    <div className="bg-white rounded-xl shadow-lg p-4 space-y-3">
      <h3 className="font-semibold text-gray-700 flex items-center gap-2">
        <Copy className="h-4 w-4" />
        Templates
      </h3>
      <div className="space-y-2">
        <select 
          onChange={(e) => loadTemplate(JSON.parse(e.target.value))}
          className="w-full p-2 border rounded-lg"
        >
          <option value="">Select a template...</option>
          {defaultTemplates.map((template, idx) => (
            <option key={idx} value={JSON.stringify(template)}>
              {template.name}
            </option>
          ))}
          {savedTemplates.map((template, idx) => (
            <option key={`saved-${idx}`} value={JSON.stringify(template)}>
              {template.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={saveTemplate}
            className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors flex items-center gap-1"
          >
            <Save className="h-4 w-4" />
            Save Current
          </button>
          <label className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors flex items-center gap-1 cursor-pointer">
            <Upload className="h-4 w-4" />
            Import
            <input
              type="file"
              accept=".json"
              onChange={importConfiguration}
              className="hidden"
            />
          </label>
          <button
            onClick={exportData}
            className="px-3 py-1 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 transition-colors flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
  
  // Advanced Configuration Component
  const AdvancedConfig = () => (
    <div className="space-y-4 border-t pt-4">
      <h3 className="font-semibold text-gray-700">Advanced Configuration</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Number of Rounds
          </label>
          <input
            type="number"
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            max="20"
            className="w-full p-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Frequency Penalty
          </label>
          <input
            type="number"
            value={frequencyPenalty}
            onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value) || 0)}
            min="-2"
            max="2"
            step="0.1"
            className="w-full p-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Presence Penalty
          </label>
          <input
            type="number"
            value={presencePenalty}
            onChange={(e) => setPresencePenalty(parseFloat(e.target.value) || 0)}
            min="-2"
            max="2"
            step="0.1"
            className="w-full p-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Top P
          </label>
          <input
            type="number"
            value={topP}
            onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
            min="0"
            max="1"
            step="0.05"
            className="w-full p-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Stop Sequences
          </label>
          <input
            type="text"
            value={stopSequences}
            onChange={(e) => setStopSequences(e.target.value)}
            placeholder="Comma-separated"
            className="w-full p-2 border rounded-lg"
          />
        </div>
      </div>
    </div>
  );
  
return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-indigo-100 to-purple-100 p-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Left side - Controls */}
        <div className="bg-white rounded-xl shadow-xl p-6 space-y-6">
          <h1 className="text-2xl font-bold text-center text-indigo-800 mb-6">LLM Chat Battle</h1>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <h2 className="font-semibold text-blue-700">AI 1</h2>
              </div>
              <select 
                value={model1}
                onChange={(e) => setModel1(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 transition-all"
              >
                {models.map(m => (
                  <option key={m} value={m}>{m.split('/')[1].replace(':free', '')}</option>
                ))}
              </select>
              <textarea
                value={context1}
                onChange={(e) => setContext1(e.target.value)}
                className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 transition-all"
                placeholder="Context for AI 1"
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-green-500" />
                <h2 className="font-semibold text-green-700">AI 2</h2>
              </div>
              <select
                value={model2}
                onChange={(e) => setModel2(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-300 focus:border-green-500 transition-all"
              >
                {models.map(m => (
                  <option key={m} value={m}>{m.split('/')[1].replace(':free', '')}</option>
                ))}
              </select>
              <textarea
                value={context2}
                onChange={(e) => setContext2(e.target.value)}
                className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-green-300 focus:border-green-500 transition-all"
                placeholder="Context for AI 2"
              />
            </div>
          </div>

          <AdvancedConfig />
          <TemplateManager />
          <MetricsDisplay />
          
          <div className="flex justify-center gap-4">
            <button
              onClick={startChat}
              disabled={loading || stopping}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full shadow-lg hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Start Chat</span>
                </>
              )}
            </button>

            {loading && (
              <button
                onClick={stopChat}
                disabled={stopping}
                className="px-6 py-3 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Square className="h-5 w-5" />
                <span>Stop</span>
              </button>
            )}

            <button
              onClick={clearChat}
              disabled={loading || stopping}
              className="px-6 py-3 bg-gray-500 text-white rounded-full shadow-lg hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="h-5 w-5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Right side - Chat Display */}
        <div className="bg-white rounded-xl shadow-xl p-6">
          <div className="h-[800px] overflow-y-auto space-y-4 p-4 rounded-lg bg-gray-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'AI1' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-sm p-4 rounded-2xl shadow-md ${
                    msg.role === 'AI1'
                      ? 'bg-gradient-to-br from-blue-50 to-blue-100 rounded-bl-none'
                      : 'bg-gradient-to-br from-green-50 to-green-100 rounded-br-none'
                  }`}
                >
                  <div className="font-semibold mb-2 flex items-center gap-2">
                    <Bot className={`h-4 w-4 ${msg.role === 'AI1' ? 'text-blue-500' : 'text-green-500'}`} />
                    {msg.role === 'AI1' ? 
                      model1.split('/')[1].replace(':free', '') : 
                      model2.split('/')[1].replace(':free', '')}
                  </div>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <div className="mt-1 text-xs text-gray-500 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {metrics.responseTimes[idx]?.toFixed(2)}s
                    <span className="mx-1">•</span>
                    {metrics.wordCounts[idx]} words
                  </div>
                </div>
              </div>
            ))}
            {currentMessage.content && (
              <div
                className={`flex ${currentMessage.role === 'AI1' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-sm p-4 rounded-2xl shadow-md ${
                    currentMessage.role === 'AI1'
                      ? 'bg-gradient-to-br from-blue-50 to-blue-100 rounded-bl-none'
                      : 'bg-gradient-to-br from-green-50 to-green-100 rounded-br-none'
                  }`}
                >
                  <div className="font-semibold mb-2 flex items-center gap-2">
                    <Bot className={`h-4 w-4 ${currentMessage.role === 'AI1' ? 'text-blue-500' : 'text-green-500'}`} />
                    {currentMessage.role === 'AI1' ? 
                      model1.split('/')[1].replace(':free', '') : 
                      model2.split('/')[1].replace(':free', '')}
                  </div>
                  <p className="text-sm leading-relaxed">{currentMessage.content}</p>
                </div>
              </div>
            )}
          </div>

          {loading && (
            <div className="text-center py-4 text-gray-600 animate-pulse">
              AIs are chatting...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LLMChat;
