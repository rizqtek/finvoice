import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as CryptoJS from 'crypto-js';

export interface BlockchainTransaction {
  id: string;
  hash?: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: number;
  fees?: number;
  metadata?: Record<string, any>;
}

export interface SmartContractInvoice {
  invoiceId: string;
  contractAddress: string;
  amount: number;
  currency: string;
  dueDate: Date;
  supplier: string;
  buyer: string;
  status: 'created' | 'pending' | 'paid' | 'disputed' | 'cancelled';
  paymentTerms: string;
  escrowEnabled: boolean;
  automaticRelease: boolean;
}

export interface BlockchainAuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  timestamp: Date;
  hash: string;
  previousHash: string;
  merkleRoot: string;
  signature: string;
  data: Record<string, any>;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private auditChain: BlockchainAuditLog[] = [];

  constructor(private readonly configService: ConfigService) {
    this.initializeBlockchain();
  }

  /**
   * Initialize blockchain connection and wallet
   */
  private async initializeBlockchain(): Promise<void> {
    try {
      // Initialize Ethereum provider (supports multiple networks)
      const rpcUrl = this.configService.get('BLOCKCHAIN_RPC_URL') || 'http://localhost:8545';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Initialize wallet
      const privateKey = this.configService.get('BLOCKCHAIN_PRIVATE_KEY');
      if (privateKey) {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.logger.log(`🔗 Blockchain wallet initialized: ${this.wallet.address}`);
      }
      
      // Test connection
      const network = await this.provider.getNetwork();
      this.logger.log(`🌐 Connected to blockchain network: ${network.name} (Chain ID: ${network.chainId})`);
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize blockchain connection:', error);
    }
  }

  /**
   * Create smart contract for invoice escrow
   */
  async createInvoiceSmartContract(invoice: {
    invoiceId: string;
    amount: number;
    currency: string;
    dueDate: Date;
    supplier: string;
    buyer: string;
    paymentTerms: string;
  }): Promise<SmartContractInvoice> {
    try {
      // Smart contract bytecode for invoice escrow (simplified)
      const contractCode = `
        pragma solidity ^0.8.0;
        
        contract InvoiceEscrow {
          address public supplier;
          address public buyer;
          uint256 public amount;
          uint256 public dueDate;
          string public invoiceId;
          bool public paid;
          bool public disputed;
          
          constructor(
            address _supplier,
            address _buyer,
            uint256 _amount,
            uint256 _dueDate,
            string memory _invoiceId
          ) {
            supplier = _supplier;
            buyer = _buyer;
            amount = _amount;
            dueDate = _dueDate;
            invoiceId = _invoiceId;
          }
          
          function payInvoice() external payable {
            require(msg.sender == buyer, "Only buyer can pay");
            require(msg.value == amount, "Incorrect amount");
            require(block.timestamp <= dueDate, "Invoice overdue");
            require(!paid, "Already paid");
            
            paid = true;
          }
          
          function releasePayment() external {
            require(paid, "Not paid yet");
            require(!disputed, "Payment disputed");
            require(msg.sender == supplier || block.timestamp > dueDate + 30 days, "Cannot release yet");
            
            payable(supplier).transfer(amount);
          }
          
          function dispute() external {
            require(msg.sender == buyer || msg.sender == supplier, "Unauthorized");
            require(paid, "Nothing to dispute");
            disputed = true;
          }
        }
      `;

      // Deploy contract (simplified - in production would compile and deploy)
      const contractAddress = this.generateContractAddress();
      
      const smartContract: SmartContractInvoice = {
        invoiceId: invoice.invoiceId,
        contractAddress,
        amount: invoice.amount,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        supplier: invoice.supplier,
        buyer: invoice.buyer,
        status: 'created',
        paymentTerms: invoice.paymentTerms,
        escrowEnabled: true,
        automaticRelease: true
      };

      // Log to audit chain
      await this.addToAuditChain({
        action: 'CREATE_SMART_CONTRACT',
        entity: 'invoice',
        entityId: invoice.invoiceId,
        userId: 'system',
        data: {
          contractAddress,
          amount: invoice.amount,
          supplier: invoice.supplier,
          buyer: invoice.buyer
        }
      });

      this.logger.log(`📄 Smart contract created for invoice ${invoice.invoiceId}: ${contractAddress}`);
      return smartContract;
    } catch (error) {
      this.logger.error(`❌ Failed to create smart contract for invoice ${invoice.invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Process blockchain payment
   */
  async processPayment(payment: {
    invoiceId: string;
    amount: number;
    fromAddress: string;
    toAddress: string;
    currency: string;
    metadata?: Record<string, any>;
  }): Promise<BlockchainTransaction> {
    try {
      if (!this.wallet) {
        throw new Error('Blockchain wallet not initialized');
      }

      // Create transaction
      const transaction: BlockchainTransaction = {
        id: this.generateTransactionId(),
        from: payment.fromAddress,
        to: payment.toAddress,
        amount: payment.amount,
        currency: payment.currency,
        timestamp: new Date(),
        status: 'pending',
        metadata: payment.metadata
      };

      // Simulate blockchain transaction processing
      const txHash = await this.submitTransaction(transaction);
      transaction.hash = txHash;
      transaction.status = 'confirmed';
      transaction.blockNumber = Math.floor(Math.random() * 1000000) + 1000000;
      transaction.gasUsed = Math.floor(Math.random() * 50000) + 21000;
      transaction.fees = transaction.gasUsed * 0.00000002; // Simplified gas calculation

      // Log to audit chain
      await this.addToAuditChain({
        action: 'PROCESS_PAYMENT',
        entity: 'payment',
        entityId: transaction.id,
        userId: payment.fromAddress,
        data: {
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          hash: txHash,
          blockNumber: transaction.blockNumber
        }
      });

      this.logger.log(`💰 Blockchain payment processed: ${txHash} (${payment.amount} ${payment.currency})`);
      return transaction;
    } catch (error) {
      this.logger.error(`❌ Blockchain payment failed for invoice ${payment.invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Verify transaction on blockchain
   */
  async verifyTransaction(transactionHash: string): Promise<{
    verified: boolean;
    confirmations: number;
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    timestamp?: Date;
  }> {
    try {
      // Simulate blockchain verification
      const confirmed = Math.random() > 0.1; // 90% success rate
      const confirmations = confirmed ? Math.floor(Math.random() * 100) + 12 : 0;
      
      return {
        verified: confirmed,
        confirmations,
        status: confirmations >= 12 ? 'confirmed' : confirmations > 0 ? 'pending' : 'failed',
        blockNumber: confirmed ? Math.floor(Math.random() * 1000000) + 1000000 : undefined,
        timestamp: confirmed ? new Date() : undefined
      };
    } catch (error) {
      this.logger.error(`❌ Failed to verify transaction ${transactionHash}:`, error);
      throw error;
    }
  }

  /**
   * Add entry to immutable audit chain
   */
  async addToAuditChain(entry: {
    action: string;
    entity: string;
    entityId: string;
    userId: string;
    data: Record<string, any>;
  }): Promise<BlockchainAuditLog> {
    try {
      const previousEntry = this.auditChain[this.auditChain.length - 1];
      const previousHash = previousEntry ? previousEntry.hash : '0x0000000000000000000000000000000000000000000000000000000000000000';
      
      const auditEntry: BlockchainAuditLog = {
        id: this.generateAuditId(),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        userId: entry.userId,
        timestamp: new Date(),
        hash: '',
        previousHash,
        merkleRoot: '',
        signature: '',
        data: entry.data
      };

      // Calculate hash
      const dataToHash = JSON.stringify({
        id: auditEntry.id,
        action: auditEntry.action,
        entity: auditEntry.entity,
        entityId: auditEntry.entityId,
        userId: auditEntry.userId,
        timestamp: auditEntry.timestamp.toISOString(),
        previousHash: auditEntry.previousHash,
        data: auditEntry.data
      });

      auditEntry.hash = CryptoJS.SHA256(dataToHash).toString();
      auditEntry.merkleRoot = this.calculateMerkleRoot([auditEntry.hash]);
      auditEntry.signature = this.signData(dataToHash);

      this.auditChain.push(auditEntry);

      this.logger.log(`🔗 Added to audit chain: ${entry.action} for ${entry.entity}:${entry.entityId}`);
      return auditEntry;
    } catch (error) {
      this.logger.error('❌ Failed to add to audit chain:', error);
      throw error;
    }
  }

  /**
   * Verify audit chain integrity
   */
  async verifyAuditChain(): Promise<{
    valid: boolean;
    totalEntries: number;
    invalidEntries: string[];
    lastVerifiedEntry: string;
  }> {
    try {
      const invalidEntries: string[] = [];
      let lastVerifiedEntry = '';

      for (let i = 0; i < this.auditChain.length; i++) {
        const entry = this.auditChain[i];
        const expectedPreviousHash = i === 0 ? '0x0000000000000000000000000000000000000000000000000000000000000000' : this.auditChain[i - 1].hash;

        // Verify previous hash
        if (entry.previousHash !== expectedPreviousHash) {
          invalidEntries.push(entry.id);
          continue;
        }

        // Verify current hash
        const dataToHash = JSON.stringify({
          id: entry.id,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          userId: entry.userId,
          timestamp: entry.timestamp.toISOString(),
          previousHash: entry.previousHash,
          data: entry.data
        });

        const calculatedHash = CryptoJS.SHA256(dataToHash).toString();
        if (entry.hash !== calculatedHash) {
          invalidEntries.push(entry.id);
          continue;
        }

        lastVerifiedEntry = entry.id;
      }

      const valid = invalidEntries.length === 0;
      
      this.logger.log(`🔍 Audit chain verification: ${valid ? 'VALID' : 'INVALID'} (${this.auditChain.length} entries, ${invalidEntries.length} invalid)`);
      
      return {
        valid,
        totalEntries: this.auditChain.length,
        invalidEntries,
        lastVerifiedEntry
      };
    } catch (error) {
      this.logger.error('❌ Audit chain verification failed:', error);
      throw error;
    }
  }

  /**
   * Get audit trail for specific entity
   */
  async getAuditTrail(entity: string, entityId: string): Promise<BlockchainAuditLog[]> {
    return this.auditChain.filter(entry => 
      entry.entity === entity && entry.entityId === entityId
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Create digital signature for document
   */
  async signDocument(document: {
    id: string;
    content: string;
    type: string;
    userId: string;
  }): Promise<{
    signature: string;
    hash: string;
    timestamp: Date;
    publicKey: string;
  }> {
    try {
      const documentHash = CryptoJS.SHA256(document.content).toString();
      const signature = this.signData(documentHash);
      
      await this.addToAuditChain({
        action: 'SIGN_DOCUMENT',
        entity: document.type,
        entityId: document.id,
        userId: document.userId,
        data: {
          documentHash,
          signature,
          contentLength: document.content.length
        }
      });

      this.logger.log(`✍️ Document signed: ${document.id} by user ${document.userId}`);
      
      return {
        signature,
        hash: documentHash,
        timestamp: new Date(),
        publicKey: this.getPublicKey()
      };
    } catch (error) {
      this.logger.error(`❌ Failed to sign document ${document.id}:`, error);
      throw error;
    }
  }

  /**
   * Verify document signature
   */
  async verifyDocumentSignature(document: {
    content: string;
    signature: string;
    hash: string;
    publicKey: string;
  }): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Verify hash
      const calculatedHash = CryptoJS.SHA256(document.content).toString();
      if (calculatedHash !== document.hash) {
        return { valid: false, reason: 'Document content has been modified' };
      }

      // Verify signature (simplified)
      const expectedSignature = this.signData(document.hash);
      if (document.signature !== expectedSignature) {
        return { valid: false, reason: 'Invalid signature' };
      }

      return { valid: true };
    } catch (error) {
      this.logger.error('❌ Document signature verification failed:', error);
      return { valid: false, reason: 'Verification error' };
    }
  }

  /**
   * Get blockchain statistics
   */
  async getBlockchainStats(): Promise<{
    totalTransactions: number;
    totalContracts: number;
    auditChainLength: number;
    networkStatus: 'connected' | 'disconnected';
    gasPrice: number;
    blockHeight: number;
  }> {
    try {
      const networkStatus = this.provider ? 'connected' : 'disconnected';
      const blockHeight = this.provider ? await this.provider.getBlockNumber() : 0;
      
      return {
        totalTransactions: Math.floor(Math.random() * 10000) + 5000,
        totalContracts: Math.floor(Math.random() * 500) + 100,
        auditChainLength: this.auditChain.length,
        networkStatus,
        gasPrice: Math.random() * 50 + 20, // Gwei
        blockHeight
      };
    } catch (error) {
      this.logger.error('❌ Failed to get blockchain stats:', error);
      throw error;
    }
  }

  // Private helper methods
  private async submitTransaction(transaction: BlockchainTransaction): Promise<string> {
    // Simulate transaction submission
    return `0x${Math.random().toString(16).substr(2, 64)}`;
  }

  private generateContractAddress(): string {
    return `0x${Math.random().toString(16).substr(2, 40)}`;
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private signData(data: string): string {
    // Simplified signing - in production use proper cryptographic signing
    const privateKey = this.configService.get('BLOCKCHAIN_PRIVATE_KEY') || 'default_key';
    return CryptoJS.HmacSHA256(data, privateKey).toString();
  }

  private getPublicKey(): string {
    return this.wallet?.address || '0x0000000000000000000000000000000000000000';
  }

  private calculateMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];
    
    // Simplified Merkle root calculation
    return CryptoJS.SHA256(hashes.join('')).toString();
  }
}